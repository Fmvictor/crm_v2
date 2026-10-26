# Pipeline del bot y atención humana

El tablero utiliza cinco etapas: Nuevo, En conversación, Interesado, Matrícula confirmada y Sin continuidad. Se conservan los identificadores `new`, `contacted`, `qualified`, `enrolled` y `lost` para mantener compatibilidad con los datos existentes.

- Nuevo pasa a En conversación al recibir la confirmación de entrega o lectura de una respuesta de WhatsApp, nunca por el simple texto generado por el modelo. La transición y su evento se guardan juntos; los callbacks repetidos no duplican la transición.
- Interesado requiere interés concreto por un curso o por continuar. La instrucción protegida excluye saludos y preguntas aisladas; el procesador exige un curso identificado. Sin continuidad automático requiere además rechazo explícito en el mensaje; el silencio no basta. Las clasificaciones terminales no retroceden automáticamente.
- Sólo una persona confirma una matrícula. El bot no agenda llamadas, ejecuta pagos ni realiza matrículas. El servidor rechaza como destino las etapas retiradas y no permite que la IA confirme matrículas.
- Mover una tarjeta no activa la IA ni resuelve atenciones. Matrícula confirmada y Sin continuidad cancelan seguimientos y no admiten nueva programación de seguimientos mientras conserven esa etapa.
- Atención pendiente, modo del bot, cierre y baja se conservan como estados independientes. Los filtros incluyen modo de atención, seguimientos y conversaciones cerradas. Las tarjetas muestran resumen, motivo pendiente, actividad, ventana de WhatsApp y estado del último envío.

## Aviso interno de atención

`HUMAN_ATTENTION_WHATSAPP_PHONE` sigue siendo el único destinatario de estos avisos. El mensaje incorpora nombre, teléfono internacional completo, motivo y contexto. Usa el resumen disponible, incluyendo el generado en el turno de derivación; añade los tres últimos mensajes con autor para cubrir también las peticiones humanas resueltas sin llamar al modelo. No realiza llamadas extra de IA ni registra teléfonos o contenido en logs.

Con `HUMAN_ATTENTION_WHATSAPP_TEMPLATE`, se mantiene la plantilla existente de tres parámetros: nombre, teléfono completo (antes eran las cuatro últimas cifras) y motivo con resumen/contexto. Los campos se envían sin saltos y con longitud limitada. No se cambia la plantilla publicada en Meta ni su aprobación. El rechazo confirmado admite el respaldo de texto existente; una respuesta incierta no provoca un segundo aviso. El respaldo está sujeto a la ventana de WhatsApp. La atención persiste en CRM aunque el envío falle.

Ejemplo ficticio de texto:

```text
⚠️ Un lead requiere atención humana.
Lead: Lead de prueba
Teléfono: +34600000009
Motivo: Solicita una persona
Resumen: Interesado en CMB1; consultó modalidad y horarios. Últimos mensajes: Lead: Quiero hablar con Víctor para continuar.
Puedes copiar el teléfono para atenderle desde tu WhatsApp.
```

Una baja muestra expresamente «Baja solicitada: no contactar». Atender desde otro número no sincroniza esos mensajes con el historial del CRM: el control humano se mantiene y la resolución/cierre se registra desde el CRM.

## Adaptación de datos y recuperación

Antes de publicar, preparar y verificar copia PostgreSQL fuera del servidor y conservar imágenes previas. La migración `BotPipeline1760000007000` mantiene los valores antiguos del enum y todos los eventos. Traslada las conversaciones de llamadas, ofertas, señales o Nutrir a En conversación, registra la etapa original y abre atención humana para revisión. Conserva cierres y bajas, cancela seguimientos y no deduce matrícula de una señal. Los contactos de soporte se actualizan también. Nuevo, Interesado, Matrícula confirmada y Sin continuidad no se migran.

Se prueba que ejecutar de nuevo la migración no duplica eventos. El rollback operativo consiste en restaurar el código/imágenes anteriores, que entienden los mismos identificadores; no se borran los eventos ni se deshacen decisiones comerciales posteriores. `migration:revert` se bloquea deliberadamente para evitar una restauración ambigua de datos.

Integrar en main activa el despliegue automático: preparar copia y revisión antes de integrar. Esta documentación no implica que el candidato esté publicado.

## Movimiento manual


En el tablero de escritorio, agentes y administradores pueden arrastrar una tarjeta completa a otra columna, incluso vacía. La columna de destino se resalta y muestra «Soltar en…». Al acercar el ratón al borde del tablero se desplazan las columnas. Escape o soltar fuera de una columna cancela el movimiento.

La tarjeta cambia de columna al confirmar el guardado. Durante la petición se indica «Guardando cambio de etapa…» y se bloquean nuevos movimientos. Si falla, se muestra un aviso y se vuelve a consultar el servidor; se puede reintentar. Soltar en la misma etapa no envía una petición.

El selector de etapa dentro de la conversación sigue disponible para teclado y móvil. El diseño móvil muestra una columna cada vez y no habilita arrastre táctil. Los perfiles de consulta pueden abrir conversaciones, pero no moverlas.

Ambas vías usan `PATCH /api/v1/conversations/:id/stage`, protegido en el servidor, y conservan el historial manual existente. La petición identifica la tarjeta movida aunque otra conversación esté abierta. No cambia el modo de IA ni marca una atención como atendida.

## Comprobación

Desde `apps/frontend/`, ejecutar `npm ci`, `npm run lint` y `npm run build`. Iniciar la interfaz en loopback: `npm run start -- --hostname 127.0.0.1 --port 3312`.

Con Python y Playwright instalados, ejecutar desde la raíz del repositorio:

```bash
python3 apps/frontend/tests/pipeline_drag.py
```

La prueba usa exclusivamente API y prospectos sintéticos, interceptados en el navegador. Rechaza destinos que no sean localhost. Cubre arrastre nativo con ratón, columnas vacías y ocupadas, filtro de atención, cancelación, mismo destino, arrastre externo, fallo y reintento, petición lenta, permisos, selector, historial, recarga y contadores. No comprueba por sí sola la persistencia de la base de datos: simula la API existente, cuyo contrato no cambia.

Variables opcionales: `PIPELINE_TEST_URL` (por defecto `http://127.0.0.1:3312`), `PLAYWRIGHT_BROWSER_PATH` y `PIPELINE_TEST_OUTPUT` (por defecto `/tmp/pipeline-drag-results`). La salida incluye `resultados.json` y capturas para revisión visual.


Comprobación adicional de cinco etapas, información de tarjetas, filtros, permisos, arrastre, fallo/reintento y selector móvil con API sintética:

```bash
# Con Playwright disponible como módulo de comprobación:
node apps/frontend/tests/pipeline_bot.mjs
```

Admite `PLAYWRIGHT_MODULE` (módulo opcional instalado fuera del proyecto), `PLAYWRIGHT_BROWSER_PATH`, `PIPELINE_TEST_URL` y `PIPELINE_TEST_OUTPUT`. El destino debe ser localhost. Genera capturas y resultados sin datos reales.
