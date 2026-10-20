# Estabilización del bot de WhatsApp

Fecha: 20 de octubre de 2026. Base: `5741b975b944491ae78e3269b9fe9674cb792578`. Documento técnico del cambio. El usuario autorizó continuar la validación y puesta en servicio mediante «hazlo» y eligió el número interno de avisos como destinatario controlado. La ejecución y el estado efectivo se registran en Coordinación y VPS ESC; ampliar la audiencia queda fuera del piloto inicial.

## Punto de partida verificado

La auditoría de lectura identificó producción en VPS ESC, `/opt/emeb-crm`, con el mismo commit que la base local. El bot estaba habilitado, sin pausa global ni restricción de números. Se observaron 1.440 fallos de seguimiento en las 24 horas consultadas, un seguimiento vencido y ningún mensaje entrante guardado después del 17 de octubre. Estos datos son una observación de la auditoría, no un monitor continuo ni una prueba de recepción actual desde Meta.

El canal conserva Caddy → Next.js → NestJS, firma HMAC, PostgreSQL, historial, pipeline y atención manual. El proveedor y el modelo existentes se conservan. La información comercial procede de `emeb.es`. No se añaden consultas generales de clientes ni operaciones de pagos o matrículas.

## Decisiones técnicas

### Entrada y cola persistente

`conversation_messages` y `ai_reply_jobs` se guardan en una transacción. El trabajo se identifica por el UUID del mensaje entrante y tiene una restricción única: repetir el webhook no crea otro trabajo. La interacción auxiliar conserva su propio identificador único y puede completarse al repetir el webhook si falló después de guardar la entrada.

PostgreSQL pasa a ser el registro de trabajos. Redis permanece en Compose, pero su lista anterior deja de alimentar las respuestas de esta versión. Esta elección evita una confirmación distribuida entre la base de datos y Redis y no añade servicios en el VPS compartido. El consumidor consulta trabajos cada segundo, con un trabajo local simultáneo y un máximo de un trabajo en ejecución por conversación, impuesto también mediante un índice único.

Estados: `pending` → `running` → `completed`; los errores de generación permiten volver a `pending`. Hay tres intentos de procesamiento, con esperas de 30 y 120 segundos entre ellos. Un trabajo de recuperación que ya agotó los intentos se deriva sin volver a invocar el modelo. La reserva vence a los 120 segundos y se renueva cada 20. Cada reserva tiene una identidad distinta: un proceso antiguo no puede completar ni reprogramar la reserva de otro.

El trabajo referencia su entrada concreta. Si otro mensaje, una respuesta manual, una baja, un cierre o una toma humana lo han dejado obsoleto, no contesta a una entrada distinta. Los trabajos no se crean mientras la automatización esté deshabilitada o pausada; reactivarla no reproduce automáticamente el historial recibido durante la pausa.

### Registro y clasificación de envíos

Antes de llamar a Meta se crea `whatsapp_dispatches`. Guarda una clave única, la petición mínima necesaria para investigar el envío y el estado. Las respuestas automáticas utilizan `reply:<UUID de entrada>`; los avisos finales al cliente, `handoff:<UUID de entrada>`; los seguimientos incluyen conversación, paso y fecha prevista.

Estados: `sending`, `sent`, `failed` y `uncertain`. `sent` significa que Meta aceptó la petición y devolvió identificador; no acredita entrega al dispositivo. `historyRecorded` indica si se completó el registro local. La entidad de mensajes y las interacciones guardan el mismo identificador del proveedor para evitar duplicar el historial.

Una desconexión, un tiempo agotado, un HTTP 408/5xx o una respuesta sin identificador dejan el envío incierto. Un proceso que cae después de enviar también puede dejar `sending`. Ninguno de esos casos se reenvía automáticamente. Se conserva evidencia y se deriva a revisión humana. Un envío aceptado cuyo historial falló se trata igualmente como revisión pendiente. El consumidor comprueba estos registros antes de recuperar un trabajo tras una caída.

No se promete entrega exactamente una vez entre PostgreSQL y Meta: no existe una transacción conjunta. La estrategia evita reenviar automáticamente cuando no puede saberse si el primer intento llegó. Los envíos manuales independientes siguen siendo decisiones del operador; la interfaz no incorpora en esta fase una clave que deduplique dos clics o dos peticiones manuales distintas.

### Control humano y errores

La derivación se persiste antes de intentar el aviso al cliente. Un fallo de ese aviso no reactiva el bot y se intenta avisar al equipo. Las peticiones humanas reconocidas directamente en español o inglés no dependen de una llamada al modelo. El resto de idiomas sigue dependiendo de su clasificación; debe validarse en el piloto.

Se conserva una derivación solicitada por el modelo aunque la pregunta sea informativa. La falta de evidencia comercial y las gestiones humanas mantienen la derivación. Una decisión sin respuesta útil también deriva. Las bajas no generan una nueva respuesta comercial.

El envío automático y los cambios de modo comparten un bloqueo por conversación. El envío vuelve a comprobar pausa global, modo, baja y, para texto de respuesta, entrada vigente y ventana de 24 horas. Una toma humana confirmada impide que un proceso pendiente inicie después una respuesta automática. Una petición ya transmitida a Meta no puede retirarse mediante una pausa posterior.

El pipeline, los cambios de modo y la actualización de datos de IA se guardan usando el estado vigente dentro de transacciones: una escritura con un objeto antiguo no debe sobrescribir una toma humana reciente. Los seguimientos comprueban también el paso y la fecha previstos; dos consumidores no avanzan dos veces el mismo paso.

Un seguimiento fallido se detiene y deja la conversación en modo humano, con motivo visible. No vuelve a intentarse cada minuto. El operador revisa plantilla, consentimiento y estado real antes de decidir una nueva actuación. Los fallos terminales de la cola también quedan en modo humano; las alertas externas siguen siendo de mejor esfuerzo y el pipeline es el registro de atención pendiente.

OpenAI tiene un tiempo máximo de 30 segundos; las peticiones a Meta, 20 segundos. Los errores de envío no copian la respuesta completa del proveedor ni teléfonos en los registros. Una plantilla de aviso solo puede usar el respaldo de texto ante un rechazo definitivo; un envío incierto no genera un segundo aviso por otra vía.

### Activación, validación y secretos

La automatización requiere conjuntamente `AI_WHATSAPP_ENABLED=true`, `AI_RELIABLE_DELIVERY_ENABLED=true`, pausa global desactivada y una audiencia explícita en `AI_WHATSAPP_TEST_PHONES`. Una audiencia vacía no permite respuestas ni seguimientos. `*` permite todos los números y debe reservarse para una ampliación aceptada del piloto. El ejemplo de configuración deja ambas activaciones en `false`.

El webhook valida estructura y tipos después de la firma, antes de crear contactos o guardar mensajes. Cuando Meta informa un identificador de número, se comprueba que corresponda al configurado. Los eventos de estado siguen sin actualizar la entrega de mensajes: esa integración continúa pendiente.

El frontend deja de recibir el archivo completo de variables del backend. Su puerto y el argumento público de construcción permanecen en Compose. La revisión de código no encontró uso de credenciales privadas en el frontend. No se cambian valores de secretos ni su almacén.

Los registros de envío contienen datos personales mínimos de la petición y deben tener los mismos permisos, protección de copias y reglas de retención que las conversaciones. No se guardan cadenas de pensamiento. El uso existente de `store:false` no sustituye la revisión de las condiciones de tratamiento del proveedor.

## Archivos principales

- `apps/backend/src/ai/ai-job.store.ts`: alta, reserva, recuperación y cierre de trabajos.
- `apps/backend/src/ai/ai-queue.service.ts`: consumidor, intentos limitados y detención de seguimientos.
- `apps/backend/src/conversations/conversations.service.ts`: entrada y trabajo atómicos y control de concurrencia.
- `apps/backend/src/whatsapp/whatsapp-dispatch.service.ts`: evidencia e idempotencia de envíos.
- `apps/backend/src/whatsapp/whatsapp.service.ts`: comprobación final de envío, tiempos máximos e historial.
- `apps/backend/src/whatsapp/meta-webhook.ts`: validación del evento entrante.
- `apps/backend/src/ai/ai-conversation.processor.ts`: toma humana previa al aviso y respuestas por entrada.
- `apps/backend/src/database/migrations/1760000002000-ReliableBotDelivery.ts`: dos tablas e índices nuevos; no utiliza la tabla antigua `bot_jobs`.
- `apps/backend/scripts/check-bot-delivery-schema.cjs` y `.github/workflows/deploy.yml`: bloquean la actualización de la aplicación si falta la migración.

## Validación del candidato

Las pruebas utilizan contactos, identificadores y mensajes sintéticos. Las llamadas a Meta y OpenAI se sustituyen; no se envían mensajes ni datos reales. Las pruebas de SQL ejecutan PostgreSQL embebido mediante PGlite, dependencia exclusiva de desarrollo fijada en el archivo de bloqueo. Cubren migración, unicidad, transacciones, reserva vencida, confirmación antigua, espera entre intentos, envío aceptado, rechazo e incertidumbre.

También se comprueban la pausa antes de enviar, el aviso fallido después de derivar, la petición humana sin proveedor IA, la preservación de la derivación del modelo, los errores al guardar historial, la audiencia explícita y los cuerpos inválidos del webhook. `npm test -- --runInBand` y `npm run build` son los comandos del candidato. El runner de pruebas habilita módulos VM para PGlite; no cambia el proceso de producción.

PostgreSQL embebido no acredita concurrencia entre procesos, TLS ni comportamiento de Meta. La validación posterior con PostgreSQL 16.15 en ARM64, una base sintética y una red Docker sin salida a Internet superó ocho escenarios: duplicados concurrentes, transacción de entrada, dos procesos independientes, recuperación tras matar un consumidor, concurrencia de envíos, incertidumbre, historial incompleto y toma humana mientras el modelo espera. El script `apps/backend/scripts/validate-postgres16.cjs` exige el host y la base de pruebas antes de modificar datos; puede ejecutarse con `npm run test:postgres16` en ese entorno.

Resultados locales del 20 de octubre: 11 suites y 59 pruebas correctas; compilación y comprobación TypeScript completa, incluidas las pruebas, correctas. ESLint de los TypeScript afectados: cero errores y cero avisos. YAML de Compose y Actions, sintaxis shell y posición del preflight comprobados. Auditoría de dependencias de producción: cero avisos. Las herramientas de desarrollo conservan los mismos 21 avisos que el archivo de bloqueo de la base (20 moderados y uno alto); PGlite no añade avisos en el informe consultado. No se ejecutaron builds Docker ni migraciones en VPS ESC.

## Procedimiento de puesta en servicio

1. Confirmar VPS ESC, commit e imágenes activos, recursos y copias. Revisar el 87 % de ocupación observado antes de construir imágenes; conservar las imágenes de recuperación. Acordar audiencia, atención humana, proveedor, datos autorizados y presupuesto.
2. Validar el candidato con PostgreSQL 16 y dos consumidores en un entorno aislado. Comprobar también pérdida de conexión después de enviar, reinicio antes de guardar historial y toma humana mientras el modelo trabaja.
3. Revisar en Meta la recepción actual, permisos, versión efectiva de Graph API y plantillas de seguimiento y alerta. La configuración observada usaba `/v19.0`; este cambio no la actualiza ni da por verificada su vigencia.
4. En una intervención autorizada, pausar la automatización antigua y comprobar que no hay generación o envíos en curso. Identificar el contenido pendiente de la lista Redis antigua y tratarlo manualmente; esta versión no lo importa ni lo reenvía. Mantener la atención humana.
5. Preparar una imagen candidata con etiqueta distinta de las imágenes activas, preservando los identificadores anteriores. Aplicar `migration:run:prod` desde esa imagen con el entorno privado del backend y las activaciones de IA deshabilitadas. El comando utiliza la CLI de TypeORM, no arranca NestJS ni sus temporizadores. La migración añade tablas e índices; no convierte datos históricos en trabajos.
6. Verificar la fila `ReliableBotDelivery1760000002000` en `migrations` y las tablas nuevas. Ejecutar el preflight con el entorno privado del contenedor backend. El workflow comprueba este requisito antes de cambiar el checkout y reconstruir; integrar en `main` sigue siendo una acción de despliegue.
7. Actualizar la aplicación manteniendo la nueva automatización deshabilitada. Verificar acceso, historial, recepción, firma inválida y atención manual con datos de prueba, sin mensajes a clientes. Comprobar que el frontend ya no recibe las variables privadas.
8. Activar solo para los números controlados acordados. Probar recepción, respuesta, derivación, baja, pausa y seguimiento autorizado. Revisar trabajos y envíos durante el piloto. Ampliar la audiencia únicamente después de la aceptación funcional.

## Observación y recuperación

Consultas de diagnóstico sin contenido de mensajes ni teléfonos:

```sql
SELECT status, count(*) FROM ai_reply_jobs GROUP BY status;
SELECT status, "historyRecorded", count(*) FROM whatsapp_dispatches GROUP BY 1, 2;
SELECT count(*) FROM ai_reply_jobs WHERE status = 'running' AND "lockedUntil" < now();
```

Un `failed`, un `uncertain`, un `sending` abandonado o un `sent` sin historial requieren revisión. Mantener la conversación en humano y comprobar la evidencia antes de cualquier envío manual. No borrar registros, cambiar sus claves ni marcar un envío como aceptado sin acreditarlo. No reactivar automáticamente una conversación para limpiar pendientes.

Para detener el piloto, usar primero la pausa global o la pausa de conversación. La configuración de activación exige recrear el backend si se cambia mediante variables de entorno. La pausa no retira peticiones ya transmitidas.

Para revertir código, pausar y drenar el consumidor, conservar las evidencias e iniciar las imágenes anteriores con `AI_WHATSAPP_ENABLED=false`: la versión antigua ignora el nuevo interruptor y una audiencia vacía permite todos los números. Verificar recepción y atención manual antes de decidir si se rehabilita cualquier automatismo antiguo. No reproducir la lista Redis ni los trabajos persistentes en paralelo.

Las tablas nuevas deben conservarse al volver al código anterior. La migración `down` solo elimina tablas si ambas están vacías; con datos se detiene para preservar la investigación. Una copia o restauración completa de base de datos no forma parte de esta reversión de código y podría borrar mensajes nuevos: requiere un procedimiento y autorización propios.

## Pendientes que esta estabilización no cierra

- Identidad comercial definitiva ESC/EMEB, idiomas y horarios, retención, presupuesto y permisos funcionales.
- Comprobación de Meta, recepción real reciente y disponibilidad de sus plantillas.
- Asociación de contactos por los últimos nueve dígitos en el código anterior: necesita normalización y conciliación de datos antes de permitir consultas de datos personales. Esta versión no amplía esas consultas.
- Recuperación asistida del historial de envíos aceptados y pantalla de diagnóstico específica; la evidencia queda en las tablas y la conversación en humano.
- Confirmaciones de entrega de Meta, notificaciones humanas persistentes y deduplicación de peticiones manuales independientes.
- Reconstrucción del orden del proveedor ante lotes que llegan tarde; la selección de entrada vigente conserva el orden de registro del historial y debe validarse con estos casos antes de ampliar el piloto.
- Referencias de fuentes por respuesta, comprobación comercial de los documentos y límites de gasto del proyecto proveedor.
- Validación funcional del piloto con recepción real desde Meta y aceptación para ampliar la audiencia.

## Correcciones verificadas en la validación real

El driver PostgreSQL de TypeORM devuelve una pareja `[filas, número afectado]` para un `UPDATE ... RETURNING`. Las pruebas embebidas devolvían directamente las filas y no detectaban esa diferencia. La reserva ahora termina con `SELECT * FROM claimed`, conserva los bloqueos y devuelve una fila de trabajo real también en PostgreSQL 16. Dos procesos independientes completaron 24 trabajos sin duplicar reservas; veinte copias concurrentes de un webhook crearon un mensaje y un trabajo.

La lectura de Meta respondió HTTP 200, informó versión efectiva `v25.0` y una aplicación suscrita. La plantilla interna de avisos está aprobada en `es`; las cuatro plantillas de seguimiento configuradas están aprobadas con código `en`. El envío de seguimiento selecciona la variante aprobada del mismo nombre, con preferencia por el idioma del lead y sin adivinar si hay varias alternativas. Se conserva el contenido aprobado. La ruta Graph se fija en `v25.0`, la misma que informó el proveedor al consultar la configuración anterior.

Tras estas correcciones, las 11 suites y 61 pruebas locales, la compilación, TypeScript completo y el lint de los archivos afectados pasaron. El destino del piloto se toma de la configuración privada; su valor no se incorpora al repositorio ni a la documentación.

## Destinatario del canal

El piloto mostró que una ficha auxiliar podía tener un teléfono distinto del identificador de WhatsApp de su conversación. La admisión y el consumidor utilizan ahora `externalContactKey`, la identidad del canal, y los seguimientos se dirigen a ese mismo valor. No se modifica la ficha ni se normalizan datos históricos de forma automática. La regresión incluye tanto la admisión de la conversación correcta como el rechazo de otra conversación cuyo contacto contenga un número permitido. La validación local completa de esta corrección superó 63 pruebas.
