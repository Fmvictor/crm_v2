# Emeb CRM — Contexto del proyecto

CRM para la academia de cursos **Emeb**. Gestiona contactos (prospectos/alumnos), cursos, inscripciones e interacciones (llamadas, WhatsApp, emails, notas, reuniones).

## Estructura del monorepo

```
crm_v2/
├── apps/
│   ├── backend/    NestJS · puerto 3001
│   └── frontend/   Next.js 15 · puerto 3000
├── docker-compose.yml
├── .env.example
└── AGENTS.md
```

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | NestJS, TypeORM, PostgreSQL 16, Redis 7 |
| Auth | Passport JWT (access 1h + refresh 30d) |
| Frontend | Next.js 15 App Router, React Query, Zustand, Tailwind CSS |
| Forms | React Hook Form + Zod |
| Infra | Docker Compose (dev/prod) |

## Módulos del backend

- **Auth** — login, refresh, me (`/api/v1/auth`)
- **Users** — CRUD usuarios internos con roles (admin/agent/viewer)
- **Contacts** — prospectos y alumnos con estados y fuentes
- **Courses** — catálogo de cursos con modalidad y estado
- **Interactions** — timeline de comunicaciones por contacto
- **Enrollments** — inscripciones con máquina de estados y pagos

## Convenciones importantes

### Zod + React Hook Form
Los campos numéricos en formularios se declaran como `z.string().optional()` (no `z.coerce.number()`). La conversión a número se hace manualmente en el `mutationFn` con `Number(value)`. Esto evita que TypeScript infiera `unknown` en el tipo del formulario al usar `zodResolver`.

### TypeORM
- `synchronize: true` solo en desarrollo (nunca en producción)
- Entidades con UUID (`uuid_generate_v4()`)
- Soft delete con `@DeleteDateColumn`
- Relaciones cargadas por defecto en consultas de listado solo si son ligeras

### API
- Prefijo global: `/api/v1`
- Todos los endpoints protegidos con `JwtAuthGuard` excepto `/auth/login`
- `ValidationPipe` global con `whitelist: true` y `forbidNonWhitelisted: true`

### Frontend
- Rutas del dashboard bajo `(dashboard)` — el layout verifica auth
- Axios instance en `src/lib/api.ts` con interceptor de refresh automático
- Auth store en Zustand con `persist` (clave: `emeb-auth`)
- Tipos compartidos en `src/types/index.ts`

## Variables de entorno necesarias (backend)

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://USER@localhost:5432/emeb_crm
REDIS_URL=redis://localhost:6379
JWT_SECRET=<secreto>
JWT_REFRESH_SECRET=<secreto-refresh>
FRONTEND_URL=http://localhost:3000
```

## Cómo correr en local (sin Docker)

```bash
# Prerequisitos (una sola vez)
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
createdb emeb_crm

# Backend
cd apps/backend
cp .env.example .env   # editar DATABASE_URL con tu usuario
npm run start:dev

# Frontend
cd apps/frontend
npm run dev

# Seed de datos de prueba
cd apps/backend
npx ts-node src/database/seed.ts
```

## Próximos pasos pendientes

- [ ] Notificaciones (correo / WhatsApp) al cambiar estado de inscripción
- [ ] Dashboard con métricas (ingresos, conversión, actividad)
- [ ] Integración WhatsApp Cloud API (Meta)
- [ ] Roles y permisos granulares por módulo
- [ ] Exportación CSV de contactos e inscripciones
