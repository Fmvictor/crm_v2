# Consumo y presupuesto de IA

El administrador ve el consumo del bot y puede fijar un límite mensual en euros. El calendario es Europe/Madrid y el límite inicial de producción aprobado por el usuario es 100 €. El registro empieza con esta migración: no inventa ni recupera consumo de los mensajes anteriores.

## Contabilidad y corte

`ai_usage_calls` conserva modelo solicitado, periodo, referencia de conversación opcional, estado, reserva, importe contabilizado, uso confirmado, duración, estado HTTP e identificador de respuesta. No guarda prompts, respuestas, teléfonos, credenciales ni cadenas de pensamiento. `ai_budget_control` conserva límite en microeuros, versión, último administrador y motivo de bloqueo.

Antes de generar, se comprueba la disponibilidad y se consulta `/v1/responses/input_tokens` con el mismo modelo, entrada y formato estructurado de la generación. Se reserva su coste máximo a tarifa de escritura de caché y 8.192 tokens de salida. Las reservas se serializan con la configuración mediante bloqueo de una fila PostgreSQL; no se mantiene la transacción abierta durante una petición al proveedor. El presupuesto no queda expuesto a dos procesos que utilicen el mismo saldo.

La petición fija procesamiento Standard (`service_tier: default`), `store: false` y `max_output_tokens: 8192`, incluyendo razonamiento. Cuando llega usage, se guarda la entrada, caché leída, caché escrita, salida y razonamiento; éste forma parte de la salida y no se suma de nuevo al coste. El precio diferencia contexto corto/largo y usa enteros con redondeo al microeuro superior. Se conserva la tarifa y cambio utilizados en cada reserva.

Si no hay saldo para reservar la siguiente llamada, se bloquean nuevas generaciones, se activa la pausa global y la conversación que encuentra el corte pasa a humano con atención persistente. No se reintenta la llamada por presupuesto, timeout o resultado incierto ni se envía un aviso automático que eluda la pausa. Los envíos manuales del equipo siguen su flujo existente.

Los rechazos explícitos HTTP 400, 401, 403, 404, 422 y 429 conservan el intento y liberan la reserva. Un timeout, error de transporte, estado 5xx o respuesta sin consumo válido conserva el importe reservado. Un proceso interrumpido deja su reserva en la base; no se libera a ciegas al reiniciar. Si no puede persistirse la liquidación, no se envía una respuesta ni se supone coste cero. Se requiere revisión humana. El registro de consumo confirmado se guarda incluso si el texto generado no es JSON válido.

La pausa global y el bloqueo por presupuesto se conservan separados. Un administrador puede cambiar el límite sin borrar consumo; guardarlo no reactiva el bot ni una conversación humana. La activación global comprueba el presupuesto dentro de la misma transacción. Un mes nuevo usa un periodo nuevo, conserva el historial y mantiene cualquier pausa anterior hasta una activación expresa. Una reserva se atribuye al mes en que se solicitó aunque se liquide después.

## API y panel

`GET /ai-usage` y `PATCH /ai-usage/budget` requieren JWT y rol administrador. El cambio exige `{monthlyLimitEur, version}`: dos decimales, 0–100.000 €, sin valores ilimitados; 0 detiene generaciones. Una versión antigua devuelve 409, datos inválidos 400 y otros roles 403. La configuración inicial es 0: primero se fija el valor aprobado y después se decide la pausa.

El panel muestra importe contabilizado y reservado, saldo, llamadas, tokens y reservas inciertas. Se actualiza cada 15 segundos; el lector y el agente no lo consultan ni pueden modificarlo. El botón de activación respeta el estado de consumo. La interfaz muestra origen y fecha de tarifas, cambio y fecha de registro para distinguir la estimación de la factura.

## Tarifas y límites de la estimación

Fuentes oficiales consultadas el 20-10-2026: [OpenAI Docs, GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [conteo de tokens](https://developers.openai.com/api/docs/guides/token-counting) y [BCE, cambio de referencia](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html). El conteo de entrada con el formato estructurado se comprobó además con una petición real sintética, sin generación.

Tarifas Standard USD por millón: entrada 10, caché 1, escritura 12,5 y salida 50; para más de 272.000 tokens de entrada, entrada y caché multiplican por dos y salida por 1,5. Cambio de referencia fechado: 1 € = 1,1215 USD. La estimación no incluye impuestos, diferencias de cambio del cobro, WhatsApp, evaluaciones externas ni otras aplicaciones; no es un límite de facturación de toda la cuenta OpenAI. No se afirma que el consumo anterior al registro fuera cero.

Esta versión admite el modelo configurado y verificado `gpt-6-astra`. Un modelo sin tarifa o una comprobación que supere la fecha interna de revisión 20-11-2026 bloquea generación hasta revisar el código y las tarifas. Esa fecha es una medida del CRM, no una garantía del proveedor. No se añadió una tarea programada ni actualización automática de tarifas.

El ejecutor comercial aislado mantiene su estado fuera de PostgreSQL y ahora exige `BOT_COMMERCIAL_EVAL_BUDGET_EUR`, con máximo 100 €, además de su autorización de evaluación. Su contabilidad es independiente y no se presenta como tráfico del bot. No se ejecutó esa batería real para esta fase.

## Migración y recuperación

`AiUsageBudget1760000004000` añade dos tablas sin alterar conversaciones, mensajes ni recibos. Antes de integrar: copia verificada dentro y fuera de ESC, imágenes previas, pausa global, migración desde la imagen candidata sin NestJS y configuración de 100 € mediante el mismo servicio que valida los cambios. El preflight exige tablas y registro antes de actualizar el checkout.

Las imágenes de esta versión usan `usage-20261020-r1`. La reversión conserva tablas y consumo, pausa y arranca las imágenes anteriores con IA deshabilitada. El `down` rechaza eliminar evidencia si hay llamadas. No se restaura una base anterior sobre mensajes nuevos.

## Validación

139 pruebas en 15 suites, compilaciones, tipos completos y lint de los archivos afectados correctos. Las pruebas cubren bloqueo previo al proveedor, reservas concurrentes, caché y contexto largo, timeout, rechazo, registro sin JSON válido, reanudación, instalación sin registro de control, calendario y permisos.

24 escenarios en PostgreSQL 16.15 ARM64 real, en red interna sin salida: ocho de fiabilidad, ocho de entrega/atención y ocho de presupuesto. Dos procesos independientes no pueden reservar el mismo saldo. Las pruebas HTTP aisladas validan también presupuesto, roles, conflicto de versión y reactivación, con receptor local y cero envíos externos. Interfaz revisada con datos sintéticos en escritorio, móvil, bloqueo y lector, sin errores JavaScript ni desbordamiento horizontal.
