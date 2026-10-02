# Emeb CRM — contexto del proyecto

El CRM se limita a dos capacidades: el **pipeline de conversaciones de WhatsApp** y el **bot de IA supervisado**.

## Estructura

```
crm_v2/
├── apps/backend/   NestJS · puerto 3001
├── apps/frontend/  Next.js · puerto 3000
├── docker-compose.yml
└── .env.example
```

## Capacidades que se conservan

- Autenticación de usuarios internos.
- Recepción y envío de mensajes mediante WhatsApp Cloud API.
- Pipeline, historial, etapas y control de toma humana de conversaciones.
- Instrucciones, pausa global y aprendizaje aprobado del bot.
- Consulta de información comercial en `emeb.es`.
- Avisos de atención humana a través de WhatsApp.

Los contactos e interacciones se conservan solo como soporte interno del pipeline, del historial de WhatsApp y del aprendizaje. No tienen interfaz ni API de gestión general.

## Convenciones

- Prefijo de API: `/api/v1`.
- Los endpoints están protegidos con `JwtAuthGuard`, salvo el inicio de sesión y el webhook de WhatsApp.
- `synchronize: true` solo fuera de producción.
- Las rutas de interfaz disponibles son `/login` y `/pipeline`.
- Los datos comerciales que responda la IA se obtienen de `emeb.es`.

## Variables de entorno esenciales

```bash
DATABASE_URL=postgresql://USER@localhost:5432/emeb_crm
REDIS_URL=redis://localhost:6379
JWT_SECRET=<secreto>
JWT_REFRESH_SECRET=<secreto-refresh>
WHATSAPP_API_TOKEN=<token>
WHATSAPP_PHONE_NUMBER_ID=<id>
WHATSAPP_BUSINESS_ACCOUNT_ID=<id>
```
