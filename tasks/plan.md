# Plan de implementación

El plan funcional está en `docs/ai-bot-spec.md`. La guía de despliegue está en `docs/ai-bot-activation.md`.

## Orden

1. Seguridad e idempotencia del webhook; atribución de envíos humanos.
2. Estado de automatización por contacto, pausa humana y bloqueo de respuestas simultáneas.
3. Consulta actual de `emeb.es` y respuestas fundamentadas.
4. Integración con modelo, clasificación, derivación y envío automático desactivado por defecto.
5. Instrucciones versionadas, memoria por contacto y aprendizaje supervisado.
6. Controles del CRM, pruebas de extremo a extremo y despliegue gradual.

Cada paso debe compilar y pasar sus pruebas antes de abordar el siguiente. No enviar mensajes reales durante las pruebas.
