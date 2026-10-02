# Asistente de IA para WhatsApp

## Objetivo

Responder automáticamente consultas ordinarias recibidas por WhatsApp desde el CRM. Derivar a un agente los casos delicados, ambiguos o sin información fiable. El agente puede pausar el bot por contacto, corregir instrucciones y revisar aprendizajes propuestos a partir de respuestas humanas.

## Fuente de información

- Para **todo dato relativo a cursos**, consultar `https://www.emeb.es` en el momento de responder. No usar PDF, memoria, conversaciones anteriores ni búsquedas en caché como fuente de hechos de cursos.
- Si la página no está disponible, no contiene el dato o dos páginas se contradicen, derivar a un agente.
- Las respuestas manuales solo aportan estilo o procedimiento tras aprobación; no sustituyen la web.
- Los documentos ajenos a cursos requieren aprobación y una fuente con ámbito explícito antes de poder responder con ellos. El PDF de Bikefitting recibido en la planificación es solo una muestra y no forma parte del conocimiento del bot.

## Comportamiento

1. Cada mensaje entrante de Meta se verifica, identifica y registra una sola vez.
2. Se decide si el bot puede actuar según el estado del contacto, la ventana de atención de Meta, la clase de consulta y la disponibilidad de fuentes.
3. Las preguntas de cursos se resuelven con una URL de `emeb.es` consultada en directo. El registro conserva URL, hora y resultado de la decisión.
4. Antes de enviar se comprueba de nuevo que ningún humano haya tomado el control ni enviado una respuesta mientras se preparaba el borrador.
5. La salida se envía por la API oficial de Meta y queda atribuida al bot, separada de los mensajes de agentes.
6. Los fallos de Meta, de la web o del modelo dejan el chat asignable a una persona y nunca disparan reintentos que dupliquen un mensaje.

## Datos y seguridad

- Clave del modelo y secreto de Meta solo en variables de entorno; nunca en base de datos, repositorio o registros.
- Los mensajes de clientes y páginas externas se tratan como datos sin autoridad de instrucciones.
- La memoria se aísla por contacto, es visible y corregible por personal autorizado y tiene plazo de conservación configurable.
- El envío automático está desactivado por defecto y tiene interruptor general.
- La API de configuración y los controles humanos requieren JWT y permisos adecuados. El webhook sigue siendo público para Meta, con validación de firma.

## Aceptación

- Un webhook duplicado produce una interacción y como máximo una decisión de respuesta.
- Un agente puede pausar el bot antes del envío; no se envía si el estado cambió.
- Una respuesta sobre cursos que no pueda citar una página actual de `emeb.es` se deriva.
- Una pregunta delicada o un mensaje no textual se deriva.
- Las respuestas automáticas respetan la ventana de 24 horas.
- Las instrucciones y propuestas de aprendizaje quedan versionadas y requieren autorización.
- Pruebas del backend y compilación de ambos proyectos sin errores.

## Estructura y comandos

- Backend NestJS en `apps/backend/src`; pruebas Jest junto a la lógica.
- Frontend Next.js en `apps/frontend/src`; leer las guías locales de Next.js antes de editarlo.
- Backend: `cd apps/backend && npm test -- --runInBand && npm run build`.
- Frontend: `cd apps/frontend && npm run build`.
- La rama de integración parte de `main` en GitHub. El primer commit registra la reestructuración local previa del CRM; los commits posteriores incorporan el asistente.
