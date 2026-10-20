# Servicio Técnico de Celulares · Backend

API REST del **Sistema de Gestión para Servicio Técnico de Celulares**: recepción de equipos por IMEI, órdenes de trabajo con máquina de estados auditada, presupuestos versionados con aprobación del cliente, inventario de repuestos con Stock Guard y portal de seguimiento para el cliente.

| Parte | Repositorio | URL desplegada |
| --- | --- | --- |
| Base de datos (PostgreSQL 17) | este repo (`servicio_back/prisma`) | _pendiente_ |
| Backend (NestJS) | este repo | _pendiente_ (Swagger en `<url>/api`) |
| Frontend (React) | [JulioOliva23/frontPF](https://github.com/JulioOliva23/frontPF) | _pendiente_ |

## Equipo

| Integrante | GitHub |
| --- | --- |
| Julio Oliva | [@JulioOliva23](https://github.com/JulioOliva23) |
| Fabricio Pinto Lozada | [@fabriciopintolozada-11](https://github.com/fabriciopintolozada-11) |
| Sergio Miguel Cisneros Salazar | [@sergiomiguelcisnerossalazar](https://github.com/sergiomiguelcisnerossalazar) |

## Stack

| Capa | Tecnología |
| --- | --- |
| Runtime | Node.js 24 · npm 11 |
| Lenguaje | TypeScript 6 (`strict`, sin `any`) |
| Framework | NestJS 11 · `ValidationPipe` global (whitelist + forbidNonWhitelisted) |
| Persistencia | Prisma 7 (`@prisma/adapter-pg`) · PostgreSQL 17 |
| Auth | Passport JWT: access 15 min + refresh 7 días con denylist · contraseñas con `argon2` |
| Seguridad | RBAC por rol en cada ruta · throttling · códigos de desbloqueo cifrados con AES-256-GCM · auditoría inmutable por trigger SQL |
| Docs | Swagger en `/api`, JSON en `/api-json` |
| Tests | Jest (unitarios con repositorios mockeados) · Supertest e2e contra Postgres real |

## Arquitectura

```text
backPF/
├── servicio_back/
│   ├── prisma/schema.prisma        ← 13 modelos (User, WorkOrder, Budget, SparePart, …)
│   ├── prisma/migrations/          ← init_phone_repair · add_work_order_tracking_code
│   ├── prisma/sql/immutable-audit.sql
│   ├── prisma/seed.ts              ← usuarios demo y catálogo
│   ├── src/domain/                 ← lógica pura: máquina de estados, IMEI (Luhn), tracking code
│   ├── src/common/                 ← guards, decorators, filtros, crypto
│   ├── src/modules/<feature>/      ← controller → service → repository (+ dto/, hooks/)
│   ├── unit-tests/                 ← Jest
│   └── test/                       ← e2e
├── .claude/agents/                 ← subagentes de Claude Code
├── scripts/hooks/                  ← hook pre-commit y validador de subagentes
├── .github/workflows/              ← CI
├── tools/docker-compose.yml        ← PostgreSQL local (puerto 5433)
├── AI_CONTEXT.md · ai-context/     ← contexto, reglas (constitution), backlog y supuestos
└── CLAUDE.md · .cursorrules
```

Capas: `controller → service → repository → Prisma`. `PrismaService` solo se inyecta en `repositories/`; la lógica de dominio no depende de Nest ni de Prisma.

### Módulos y endpoints (`/api/v1`)

| Módulo | Endpoints principales |
| --- | --- |
| `auth` | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/profile` |
| `users` | `POST /users` · `GET /users` · `DELETE /users/:id` |
| `devices` | `GET /devices/by-imei/:imei` · `GET /device-models` · `POST /device-models` |
| `work-orders` | `POST /work-orders` · `GET /work-orders` · `GET /work-orders/mine` · `GET /work-orders/:id` · `POST /work-orders/:id/assign-technician` · `PATCH /work-orders/:id/diagnosis` · `POST /work-orders/:id/transitions` · `POST /work-orders/:id/unlock-code/reveal` · `GET /work-orders/:id/audit` · `POST /work-orders/:id/tracking-code/regenerate` |
| `budgets` | `POST /work-orders/:workOrderId/budgets` · `GET /work-orders/:workOrderId/budgets` · `GET /budgets/:id` · `POST /budgets/:id/send` · `POST /budgets/:id/approve` · `POST /budgets/:id/reject` |
| `spare-parts` | CRUD `/spare-parts` · `POST /spare-parts/:id/stock-entries` · `POST /spare-parts/:id/adjustments` · `GET /spare-parts/alerts/low-stock` |
| `public/tracking` | `POST /public/tracking` (portal del cliente, sin login) |

La referencia completa con esquemas está en Swagger (`/api`).

### Máquina de estados de la orden

```text
RECEIVED → IN_DIAGNOSIS → BUDGETED → APPROVED → IN_REPAIR → QUALITY_CONTROL → READY_FOR_DELIVERY → DELIVERED
                                     (Stock Guard al entrar a IN_REPAIR)      └── rework ──┘
RECEIVED / IN_DIAGNOSIS / BUDGETED → CANCELLED → DELIVERED
```

Las transiciones y los roles permitidos viven en `src/domain/work-orders/work-order-state-machine.ts`. Una transición ilegal responde `409`; un rol no permitido, `403`. Antes de cada transición corren los hooks de dominio (`workflow-preconditions`, `inventory-stock-guard`) y cada cambio queda en `work_order_status_audits`, tabla protegida contra `UPDATE`/`DELETE` por trigger.

## Ejecutar en local

Requisitos: Node.js 24, npm 11 y Docker.

```bash
docker compose -f tools/docker-compose.yml up -d    # PostgreSQL en localhost:5433
cd servicio_back
cp .env.example .env                               # completar secretos (ver tabla)
npm install
npx prisma migrate deploy                          # aplica las migraciones
npm run prisma:seed                                # usuarios demo
npm run start:dev                                  # http://localhost:3000/api/v1 · Swagger en /api
```

Usuarios del seed: `admin01`, `recep01`, `tecnico01`, `tecnico02`, `cliente01`. La contraseña es la que definas en `SEED_PASSWORD` (o `SEED_PASSWORD_<ROL>`).

### Variables de entorno

Plantilla en [`servicio_back/.env.example`](servicio_back/.env.example). El `.env` real nunca se versiona (`.gitignore` y el hook pre-commit lo bloquean).

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `TEST_DATABASE_URL` | Base separada para `npm run test:e2e` |
| `JWT_SECRET` · `JWT_REFRESH_SECRET` | Secretos de firma (mínimo 32 caracteres, distintos) |
| `JWT_EXPIRES_IN` · `JWT_REFRESH_EXPIRES_IN` | Duración de los tokens (`15m`, `7d`) |
| `PORT` | Puerto HTTP (por defecto 3000) |
| `LABOR_HOURLY_RATE` · `BUDGET_VALIDITY_DAYS` | Tarifa de mano de obra y días de validez del presupuesto |
| `UNLOCK_CODE_ENCRYPTION_KEY` | Clave AES-256 en hex (64 caracteres) |
| `CORS_ORIGINS` | Orígenes permitidos separados por coma (en producción, la URL del frontend) |
| `SEED_PASSWORD` · `SEED_PASSWORD_<ROL>` | Contraseñas de los usuarios demo |

## Scripts (`servicio_back/`)

| Script | Qué hace |
| --- | --- |
| `npm run start:dev` | Servidor con recarga |
| `npm run build` | `prisma generate` + build de producción en `dist/` |
| `npm start` | Arranca el build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Tests unitarios (Jest) |
| `npm run test:e2e` | Tests e2e con Supertest (requiere `TEST_DATABASE_URL`) |
| `npm run prisma:migrate` | Nueva migración en desarrollo |
| `npm run prisma:seed` | Carga datos demo |

## Calidad: hooks, CI y subagentes

- **Hook pre-commit** ([`scripts/hooks/hook-pre-commit.sh`](scripts/hooks/hook-pre-commit.sh), instalado por Husky con `npm install` en la raíz): bloquea el commit si hay un `.env` en stage o si fallan lint, typecheck o tests del paquete modificado.
- **Hooks de dominio** (`src/modules/work-orders/hooks/`): precondiciones del flujo y Stock Guard, ejecutados antes de cada transición, con sus propios tests.
- **CI** ([`.github/workflows/hooks-and-agents.yml`](.github/workflows/hooks-and-agents.yml)), en cada push a `main` y en cada PR:
  - `git-hooks`: corre el mismo hook pre-commit sobre el diff y los tests de los hooks de dominio.
  - `subagents`: valida el frontmatter de los subagentes.
  - Ambos publican un reporte en el resumen del run (Actions → run → Summary).
- **Subagentes** ([`.claude/agents/`](.claude/agents/), detalle en [`.ai/README.md`](.ai/README.md)):

| Agente | Cuándo usarlo |
| --- | --- |
| `@agent-domain-architect` | Esquema Prisma, migraciones, índices, triggers, atomicidad |
| `@agent-api-core` | Endpoints, DTOs, services, repositories y RBAC |
| `@agent-qa-security` | Tests unitarios/e2e y auditoría de seguridad |

## Flujo de trabajo

Ramas `feat/*` y `fix/*` desde `main`, integradas con Pull Request y la CI en verde. Commits con [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `ci:`, `chore:`).
