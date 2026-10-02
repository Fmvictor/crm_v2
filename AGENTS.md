# Emeb WhatsApp CRM

Aplicación mínima para gestionar conversaciones de WhatsApp y mover contactos por un pipeline comercial.

## Módulos

- **Auth**: login, refresh y sesión de usuarios internos.
- **Contacts**: contactos con teléfono, notas y etapas del pipeline.
- **Interactions**: historial de mensajes WhatsApp, solo lectura desde la aplicación.
- **WhatsApp**: envío de texto, plantillas, webhook de Meta y alta automática de contactos entrantes.

El frontend solo expone Resumen, WhatsApp e Pipeline. No añadir módulos de cursos, inscripciones, pagos, email, llamadas o reuniones dentro de este proyecto.

## Stack

- Backend: NestJS, TypeORM, PostgreSQL y Redis.
- Frontend: Next.js App Router, React Query, Zustand, Tailwind CSS.
- Prefijo API: `/api/v1`.

## Reglas críticas

- No registrar tokens o secretos en chat, logs o repositorio.
- El webhook `GET/POST /api/v1/whatsapp/webhook` debe permanecer público para Meta.
- Los endpoints de consulta de plantillas y envío requieren JWT.
- Todo mensaje entrante y todo envío confirmado debe quedar como interacción `whatsapp`.
- Normalizar teléfonos a dígitos antes de consultar o enviar.
- `synchronize` solo puede estar activo fuera de producción.
