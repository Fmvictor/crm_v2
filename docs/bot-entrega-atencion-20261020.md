# Confirmaciones de entrega y atenciones persistentes

La aceptación HTTP de un envío por Meta no demuestra su entrega al teléfono. El webhook guarda ahora los eventos firmados `sent`, `delivered`, `read` y `failed`, y el pipeline muestra el estado confirmado de cada mensaje saliente. Sin un evento asociado se muestra «Sin confirmación de entrega».

## Registro y conciliación

`whatsapp_status_events` conserva identificador del mensaje, destinatario, estado, hora del proveedor y código numérico de error. No guarda títulos, detalles de errores, precios ni el cuerpo original del callback. La combinación de mensaje, destinatario, estado y hora es única. El canal se valida después de comprobar HMAC y antes de persistir.

El webhook confirma después de guardar los eventos; no espera al envío ni a un bloqueo de conversación. Un conciliador interno consulta hasta 25 mensajes pendientes cada 15 segundos, con bloqueo de la conversación y un tiempo máximo de espera de un segundo por bloqueo. Un fallo conserva el evento y no impide trabajar con otros mensajes del lote. Sólo se marcan procesados los eventos de la instantánea leída; un callback concurrente sigue pendiente hasta el siguiente ciclo. Un reinicio vuelve a encontrar lo pendiente. No llama a Meta ni reenvía mensajes.

La asociación exige el identificador externo del mensaje saliente y el destinatario completo de su conversación, nunca un sufijo del teléfono auxiliar. Si el evento llega antes que el historial, queda guardado hasta que exista ese mensaje. Un evento con identificador o destinatario desconocidos no crea contactos ni modifica otra conversación. Los estados futuros no soportados se ignoran sin provocar un bucle de reintentos del proveedor.

La lectura prevalece sobre entrega, la entrega sobre fallo y el fallo sobre envío. Así, un evento tardío no hace retroceder evidencia positiva de entrega o lectura. Los eventos originales se conservan; esta prioridad es una decisión conservadora del CRM. Una entrega posterior a un fallo no reactiva la IA ni cierra una atención por su cuenta. El registro `whatsapp_dispatches.status='sent'` sigue significando aceptación por el proveedor, separado del estado confirmado del mensaje.

## Atención que sobrevive a un aviso externo fallido

Las derivaciones automáticas, los fallos terminales de trabajos, los seguimientos fallidos y los fallos confirmados de entrega crean una fila en `conversation_attention_events`. Se guardan en la transacción que deja la conversación en humano y cancela su seguimiento. La clave estable por causa impide reabrir una atención ya atendida al repetir un trabajo o callback antiguo. Las alertas externas continúan siendo complementarias: el pipeline es la fuente de atenciones pendientes aunque WhatsApp no esté disponible.

La conversación mantiene un indicador, una versión, motivo y fechas. Un agente o administrador puede usar `POST /conversations/:id/attention/acknowledge` con la versión que ha visto. Se registran usuario y hora, pero no se activa la IA. Una versión antigua devuelve 409 y un lector recibe 403. La reactivación por administrador devuelve 409 mientras haya atención pendiente; resolverla y reactivar son decisiones separadas.

El pipeline prioriza las conversaciones con atención pendiente y permite filtrarlas. Una pendiente no queda oculta por el estado cerrado. El detalle se actualiza periódicamente y muestra el aviso hasta que se marque atendido. El historial distingue enviado, entregado, leído y no entregado; las plantillas quedan plegadas para reservar espacio en móvil. El cliente y el servidor limitan las acciones al rol correspondiente.

## Responsable y horario

Los avisos localizados pueden añadir un responsable y calendario configurados en el entorno privado del backend:

```text
HUMAN_ATTENTION_AGENT_NAME
HUMAN_ATTENTION_START
HUMAN_ATTENTION_END
HUMAN_ATTENTION_DAYS
HUMAN_ATTENTION_TIMEZONE
```

En esta versión se admite el calendario confirmado de lunes a viernes (`1,2,3,4,5`), hora de Madrid (`Europe/Madrid`) y horas válidas en formato `HH:mm`. Una configuración incompleta o inválida conserva el aviso genérico. Comunicar un horario no garantiza un plazo de respuesta ni habilita mensajes fuera de las reglas del canal. Los textos se localizan en los mismos siete idiomas de la derivación existente.

## Migración, despliegue y recuperación

`DeliveryAttention1760000003000` añade campos y dos tablas, sin convertir el historial anterior en confirmaciones ni atenciones nuevas. Los mensajes antiguos sin callback conservarán su entrega desconocida. La migración tolera los campos creados por `synchronize` en un entorno de desarrollo; las tablas de evidencia se crean mediante migración. Producción mantiene `synchronize=false`.

Antes de integrar: copia verificada dentro y fuera del servidor, imágenes previas preservadas, bot pausado, migración ejecutada desde el candidato sin arrancar NestJS y comprobación del preflight. Éste exige registro, tablas y columnas nuevas antes de actualizar el checkout. Las imágenes usan etiquetas distintas: `emeb-crm-backend:attention-20261020-r1` y `emeb-crm-frontend:attention-20261020-r1`.

La reversión arranca las imágenes anteriores con IA deshabilitada y conserva estas tablas y columnas. `down` se bloquea si existen eventos, para preservar evidencia; no hace falta restaurar una copia sobre mensajes nuevos para volver al código previo. Los eventos contienen identificadores personales mínimos y deben incluirse en las mismas reglas de permisos, copias y retención de las conversaciones. La política de retención y la ampliación de audiencia continúan pendientes de definición funcional.

## Verificación

114 pruebas en 14 suites, compilación y TypeScript completo del backend; compilación y lint de la interfaz. Las pruebas SQL cubren duplicados, eventos desordenados, destinatarios distintos, recepción antes del historial, fallo persistente, reversión transaccional y una conciliación que se recupera después de un bloqueo.

En PostgreSQL 16 real, dentro de una red Docker sin salida, pasaron los ocho escenarios de fiabilidad anteriores y ocho nuevos: veinte callbacks concurrentes duplicados, dos procesos de conciliación, resolución sin reactivar IA, recepción temprana, destinatario erróneo, concurrencia entre resolución y nueva atención, y visibilidad de atenciones de conversaciones cerradas, y callback nuevo confirmado en una segunda conexión durante la lectura de una instantánea.

Las pruebas HTTP aisladas verificaron autenticación, firma, eventos duplicados, envío a un receptor local, fallo de entrega persistente, conflicto con una versión antigua, rechazo a lectores y resolución conservando humano. Cero envíos externos. La interfaz se renderizó con datos sintéticos en escritorio, móvil y lector, con verificación de conflicto y sin errores JavaScript. Esas pruebas no se presentan como entrega real confirmada por Meta.

Referencia del formato: [colección oficial de Meta, objeto statuses](https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object). La documentación directa de developers.facebook.com devolvió 429 durante la consulta; se contrastaron los campos con la colección oficial mantenida por Meta. No se modificó la suscripción ni la versión de Graph API.
