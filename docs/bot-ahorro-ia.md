# Consumo de IA: Sol y contexto por curso

22-10-2026. Se utiliza `gpt-6.1-sol` en Responses, nivel Standard, formato JSON estricto y `store: false`. Se conserva el razonamiento predeterminado, las instrucciones publicadas, el borrador y el límite de 100 €/mes. Las tarifas verificadas son 2 USD/M de entrada, 0,10 de lectura de caché, 2,50 de escritura y 10 de salida; el contexto largo mantiene sus multiplicadores. Cambio de referencia conservado y revisión antes del 20-11-2026.

El consumo histórico conserva modelo, tarifa y coste registrados en cada llamada. Cambiar de modelo no recalcula llamadas previas ni reinicia el presupuesto. Un modelo configurado sin tarifa verificada sigue bloqueando generación. La variable `OPENAI_MODEL` del servidor debe coincidir con el perfil admitido por el código.

## Contexto conservador

Los documentos originales siguen completos y editables en Asistente. Para catálogos Markdown cuyo título identifica un catálogo de cursos y cuyos cursos usan apartados `## 1. Nombre · ...`, se envían el apartado completo del curso mencionado y todas las secciones comunes. Una comparación conserva los cursos mencionados. CMB1 Online prevalece sobre la coincidencia parcial CMB1; una mención actual prevalece sobre mensajes anteriores. Las continuaciones usan primero mensajes anteriores del cliente y después el interés guardado, sin inferir el curso de respuestas del bot.

Las consultas ambiguas, cursos desconocidos, listas numéricas abreviadas y documentos sin esa estructura conservan todo su contenido. Los bloques de código tampoco se interpretan como estructura del catálogo. No se truncan secciones ni se descartan documentos vigentes; conflictos y condiciones comunes continúan visibles. Los documentos vencidos/desactivados siguen excluidos. Las fuentes se atribuyen con la huella completa de cada documento publicado.

La consulta web opcional se omite sólo para preguntas estáticas identificadas —duración/modalidad, contenidos/campus/soporte y horario— con curso y evidencia presentes en el documento. Precios, fechas, plazas, descuentos, alojamiento, ediciones y condiciones actuales siguen consultando la web; preguntas sin evidencia suficiente también. La prioridad documental y las derivaciones se mantienen.

## Verificación y recuperación

Las pruebas cubren presupuesto concurrente, caché, historial de costes de Astra, selección de cursos, continuaciones, documentos generales, consultas ambiguas y condiciones comerciales. Antes de activar se evalúan casos sintéticos con la publicación vigente; no se envían WhatsApps ni se usan conversaciones reales para esa evaluación. Sus llamadas se contabilizan en el presupuesto normal del bot.

Preparar copia privada, esperar a que no haya llamadas/reservas en curso y pausar al actualizar. La recuperación debe restaurar conjuntamente la imagen anterior y su `OPENAI_MODEL`, dejando el bot pausado para revisión y conservando datos posteriores. Si entran mensajes durante mantenimiento, comprobarlos para atención desde CRM; no repetir el historial ni reactivar conversaciones humanas automáticamente.

Fuentes: [OpenAI Docs, Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [migración GPT-6](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol) y [caché](https://developers.openai.com/api/docs/guides/prompt-caching). Los informes de Astra anteriores se conservan como historial.
