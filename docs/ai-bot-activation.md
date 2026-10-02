# Activación del asistente de WhatsApp

## Antes de arrancar

1. Revisar los dos bloques de cambios de esta rama: primero la reestructuración local previa del CRM y después el asistente de IA. La fusión en `main` no despliega: el workflow queda limitado a ejecución manual.
2. Guardar una copia de seguridad de PostgreSQL y ejecutar `apps/backend/migrations/20261002_whatsapp_interaction_metadata.sql` una sola vez. La tabla `bot_control` queda creada con `paused = true`.
3. Completar el `.env` del servidor a partir de `.env.example`. Configurar `WHATSAPP_APP_SECRET` con el secreto de la aplicación de Meta antes de reiniciar el backend; configurar `OPENAI_API_KEY` antes de usar borradores o respuestas automáticas. Nunca guardar los valores en Git.
4. Comprobar que el webhook de Meta apunta a `/api/v1/whatsapp/webhook` y entrega `x-hub-signature-256`. El backend rechazará peticiones sin firma válida.
5. Ejecutar manualmente el workflow **Deploy to server (manual)** solo después de completar los pasos anteriores.

## Despliegue gradual

1. Iniciar con `BOT_MODE=off`. Verificar recepción de mensajes, deduplicación y envíos manuales.
2. Cambiar a `BOT_MODE=draft` y reiniciar el backend. Quitar la pausa general desde WhatsApp, revisar los borradores y las fuentes de `emeb.es`; mantener los envíos en manos de agentes.
3. Cuando las respuestas estén revisadas, usar `BOT_MODE=auto`, reiniciar el backend y quitar la pausa general. Supervisar la bandeja de atención humana y los estados de entrega.
4. Para detener respuestas nuevas, pulsar **Pausar todo el bot**. `BOT_MODE=off` exige reinicio y sirve como apagado adicional.

Las consultas de cursos toman los datos de `https://www.emeb.es` en cada respuesta. El PDF aportado como ejemplo no se carga. Las respuestas manuales generan propuestas que un administrador depura y aprueba para estilo o proceso; no aportan hechos sobre cursos.

## Verificación previa

```bash
cd apps/backend && npm ci && npm run build && npm test -- --runInBand
cd ../frontend && npm ci && npm run build
```

Probar con un número de WhatsApp de ensayo antes de habilitar `auto`: pregunta ordinaria sobre un curso, consulta de fecha/precio, pregunta delicada, imagen, petición de persona, intervención manual mientras el bot prepara respuesta, webhook duplicado y pausa general. Confirmar que los casos delicados aparecen en la bandeja y que no hay envíos duplicados.

## Límites conocidos

- Esta rama no se ha probado contra la base de datos o número reales. No se ha desplegado ni enviado ningún mensaje a clientes.
- El buscador consulta el índice y las fichas de cursos, fechas, la portada y secciones enlazadas desde ella. Las páginas no enlazadas y los archivos descargables aún no se indexan; si no encuentra sustento, deriva a un agente. Antes de añadir documentos nuevos hace falta registrar su ámbito y comprobar que no sustituyan la web como fuente de cursos.
- La memoria del contacto caduca a los 90 días y el backend elimina diariamente las memorias vencidas.
