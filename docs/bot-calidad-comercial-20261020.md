# Correcciones del piloto comercial

La batería del 20 de octubre encontró seis casos no conformes: pérdida del curso en una pregunta breve, omisión de fuentes por intención o idioma, falta de derivación ante datos no publicados y avisos humanos en español para clientes que escriben en inglés o francés.

## Comportamiento resultante

La recuperación de información recibe los mensajes anteriores y el interés guardado del contacto. El curso explícito del mensaje actual tiene prioridad; después se toma la mención más reciente del cliente y finalmente el interés guardado. Las respuestas del bot no determinan el curso. Así, «¿Y cuánto cuesta?» puede recuperar CMB1 sin impedir un cambio explícito a Bikefitting.

Las intenciones se combinan: precio o fechas pueden consultar la ficha, mientras alojamiento y método añaden sus fuentes respectivas. «Cursos» por sí solo ya no excluye la metodología. Se reconocen expresiones de búsqueda en español, inglés y francés; esto no acredita cobertura lingüística completa. Las advertencias por una web no disponible preceden al contenido para conservarlas al recortar el contexto.

La decisión estructurada incorpora `informationVerified`. El modelo debe indicar si el contexto permite contestar la petición concreta, incluidas las condiciones solicitadas. El backend deriva si ese valor falta o es falso, salvo una baja ya reconocida; también conserva las derivaciones solicitadas por el modelo. Es una señal de suficiencia declarada por el modelo, no una comprobación independiente de cada afirmación ni una garantía de exactitud. Los precios, fechas y condiciones siguen procediendo exclusivamente de `emeb.es`.

Los avisos humanos usan textos fijos localizados. Se prioriza el idioma detectado en la petición actual y después un idioma guardado válido. Hay textos para español, inglés, francés, catalán, alemán, italiano y portugués; otros idiomas conservan el respaldo español. Las peticiones reconocidas directamente en español, inglés y francés se derivan sin llamar al modelo, manteniendo la pausa antes de intentar el aviso. Las alertas internas conservan la plantilla del equipo.

El prompt distingue consultas informativas de consentimiento para seguimientos: preguntar por un curso no concede ese consentimiento. No se habilitan nuevas operaciones, destinatarios ni fuentes.

## Verificación y evaluación reproducible

Las pruebas cubren selección combinada de fuentes, continuidad entre mensajes, cambio explícito de curso, prioridad frente al dato guardado, rechazo de respuestas del bot como referencia, advertencias largas, señal de evidencia ausente y texto final de derivación.

`scripts/evaluate-commercial.cjs` reproduce los 18 casos de `scripts/fixtures/commercial-cases.json`. No inicia NestJS, no conecta a PostgreSQL o Redis y captura los envíos en memoria. Sólo permite lecturas de la web pública y un máximo de 16 llamadas al proveedor actual. Requiere `BOT_COMMERCIAL_EVAL_ENABLED=true` y las credenciales privadas del proveedor en el proceso autorizado; nunca se deben imprimir ni guardar con los resultados. Puede seleccionarse un directorio compilado candidato mediante `BOT_COMMERCIAL_EVAL_DIST`, sin sustituir la aplicación activa.

Ejemplo, desde `apps/backend` y con el entorno seguro ya disponible:

```sh
BOT_COMMERCIAL_EVAL_ENABLED=true node scripts/evaluate-commercial.cjs
```

Cada resultado guarda decisión, envíos sintéticos, URL y huella del contexto, uso de tokens y duración del caso. Se necesita revisión contra los criterios y fuentes: un código de salida correcto no acredita conformidad comercial. La batería dirigida no estima calidad estadística en producción.

La ejecución candidata terminó los 18 casos sin errores, con 14 llamadas al modelo y 51.663 tokens. La revisión de decisiones y mensajes finales considera conformes los 18 casos, incluido C16 con derivación por una cantidad de práctica que no está especificada en la página del método. La selección de esa fuente queda corregida; el mensaje final de ese caso es un aviso de derivación, no una explicación parcial de la metodología. La lectura independiente de la misma página, con SHA256 coincidente, no encontró porcentajes ni cantidades de horas. Las capturas de WhatsApp fueron exclusivamente sintéticas.

## Despliegue y recuperación

El cambio no modifica el esquema ni las credenciales. El backend usa la etiqueta nueva `commercial-20261020-r1`; la imagen previa `delivery-20261020-r2` se conserva. Antes de integrar se comprueban copia, recursos y audiencia. La conversación interna permanece humana hasta una prueba real explícita. GitHub Actions construye la imagen, ejecuta las pruebas y verifica la web, la API y la protección de conversaciones. Tras desplegar se comprueban los módulos activos, el estado de la cola y la audiencia de un número.

Para volver al código previo se conserva la pausa global y se inicia la imagen anterior con la configuración segura del piloto. Se mantienen los datos de conversaciones, trabajos y envíos; no hace falta revertir tablas ni restaurar una copia sobre mensajes nuevos.

Referencia de la nueva propiedad obligatoria en el esquema: [OpenAI Docs, salidas estructuradas](https://developers.openai.com/api/docs/guides/structured-outputs).
