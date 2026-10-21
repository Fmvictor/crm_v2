# Instrucciones, conocimiento y reglas del asistente

El administrador abre **Asistente** en el menú del CRM (`/assistant`). La sección **Publicado** muestra la versión activa, permite descargar `asistente.md` y los documentos y expone las instrucciones completas ensambladas para el modelo. El contenido se conserva en PostgreSQL del VPS ESC; no depende de un archivo en el contenedor ni de un asistente alojado en el panel de OpenAI. OpenAI recibe las instrucciones y el contexto en cada petición a Responses, con `store: false`.

## Preparar y publicar

1. En **Instrucciones**, escribe o importa `asistente.md`: identidad, tono y forma de atender. La vista previa interpreta Markdown sin ejecutar HTML ni cargar imágenes externas.
2. En **Conocimiento**, añade archivos `.md` con la información autorizada para responder. Se pueden editar, descargar, desactivar y fechar. La fecha incluye todo ese día en Madrid. Los documentos desactivados o vencidos no entran en el contexto.
3. En **Reglas**, configura consulta web, responsable y horario, textos de derivación, temas y expresiones que requieren una persona, y días de seguimiento. El presupuesto continúa en el panel de consumo del Pipeline.
4. **Guardar borrador** conserva el trabajo sin modificar la versión activa. **Validar** comprueba estructura, límites y disponibilidad de fuentes. **Pruebas** permite ver el contexto sin generación o probar con IA, sujeto al mismo presupuesto mensual. Ninguna prueba envía WhatsApps ni crea conversaciones.
5. **Publicar cambios** crea una versión nueva e inmutable. Hasta ese momento se utiliza la versión publicada anterior. Editar de nuevo obliga a guardar y validar otra vez.

El historial ofrece las últimas 100 publicaciones con fecha, autor y huella. **Recuperar** copia la versión elegida al borrador: hay que validarla y publicarla para activarla. El origen de la recuperación queda asociado a la nueva publicación. No se eliminan las versiones anteriores.

Si otro administrador guarda o publica, una revisión antigua recibe HTTP 409. El editor conserva el texto local y ofrece descargar el borrador completo antes de descartarlo y recargar. La descarga JSON sirve como copia de trabajo; la importación de contenidos se hace desde sus archivos Markdown.

## Fuentes y reglas

Por decisión del usuario del 21-10-2026, los documentos propios publicados son la fuente comercial principal. `emeb.es` es una fuente secundaria opcional y conserva su caché separada; nunca reescribe los documentos propios. La migración inicial mantiene la consulta web y no incorpora documentos comerciales inventados. Las instrucciones y ejemplos heredados vigentes se trasladan a la primera versión.

Si dos documentos se contradicen o falta evidencia para la pregunta concreta, se deriva. Los ejemplos aprobados orientan tono y proceso; se incorporan expresamente al borrador y solo se utilizan después de publicar. Aprobar un ejemplo en el Pipeline no altera por sí mismo una publicación.

Las reglas de negocio se editan mediante campos validados. Las protecciones de autenticación, firmas, bajas, consentimiento, toma humana, pausa, presupuesto, deduplicación y ventana de WhatsApp permanecen en código y se muestran como consulta. Desmarcar un tema de derivación permite informar con evidencia; no concede herramientas para cobrar ni matricular. Las credenciales y los límites de audiencia del piloto no se editan aquí.

Cambiar o desactivar los días de seguimiento cancela las fechas pendientes. Volver a activarlos no recupera seguimientos cancelados ni cambia conversaciones humanas a automáticas. Los días admitidos son 1, 3, 7 y 14, correspondientes a las plantillas aprobadas ya configuradas.

## Almacenamiento y trazabilidad

- `bot_config_versions`: publicaciones inmutables, configuración completa, SHA-256, autor, fecha y origen de recuperación.
- `bot_config_state`: única publicación activa, borrador, revisión y huella validada. Las modificaciones usan comparación de revisión para evitar sobrescrituras.
- `bot_config_usage_refs`: relación de cada llamada de IA con la versión publicada o con la revisión y huella de una prueba. Solo almacena identificadores de fuentes y sus hashes; no duplica textos de clientes ni respuestas en el registro de consumo.
- Los mensajes automáticos guardan la versión y fuentes en `metadata`. El Pipeline muestra esa referencia. Los mensajes históricos anteriores al cambio no reciben una atribución ficticia.

Una respuesta carga una sola publicación. Si cambia durante la generación, se descarta el envío y se pide revisión humana. Una cerradura compartida de PostgreSQL comprueba la versión antes del transporte; publicar requiere la cerradura exclusiva. Una publicación espera los envíos ya autorizados, y los envíos posteriores con una versión antigua quedan bloqueados. La programación inicial de seguimientos al recibir mensajes utiliza esa misma exclusión.

Límites: `asistente.md`, 12.000 caracteres; hasta 10 documentos de 15.000 caracteres; hasta 8 ejemplos de 4.000 caracteres; configuración total, 80 KB UTF-8. Los documentos vigentes se incluyen completos dentro de ese límite. No se truncan silenciosamente ni se sincronizan con carpetas externas.

## Migración y recuperación del despliegue

`AssistantConfiguration1760000005000` añade las tablas y conserva las instrucciones heredadas. Se aplica antes de actualizar la aplicación, con copia privada verificada y bot pausado. `check-bot-delivery-schema.cjs` detiene el despliegue si falta esta migración. El rollback de código conserva tablas e historial; la migración se niega a borrarlos mediante `down`.

Comprobaciones repetibles: pruebas Jest; scripts `validate-postgres16.cjs`, `validate-delivery-attention.cjs`, `validate-usage-budget.cjs`, `validate-assistant-configuration.cjs`; API aislada con `validate-api-isolated.cjs` y `validate-assistant-api.cjs`. Los scripts destructivos exigen la base `emeb_validation` y el host `emeb-validation-postgres` y usan exclusivamente datos sintéticos.

La validación concurrente detectó una carrera anterior en la reserva de trabajos. `AiJobStore.claim()` serializa la transacción breve de reserva mediante un bloqueo asesor de PostgreSQL; las generaciones siguen ejecutándose fuera del bloqueo. La lectura posterior al bloqueo usa un snapshot actualizado. La regresión se repite con dos procesos y 120 trabajos en cinco rondas.
