# Servicio Técnico de Celulares · Backend

API REST del **Sistema de Gestión para Servicio Técnico de Celulares**: recepción de equipos por IMEI, órdenes de trabajo con máquina de estados auditada, presupuestos versionados con aprobación del cliente, inventario de repuestos con Stock Guard y portal de seguimiento para el cliente.

Propuesta de producto, precios y guion de demo: [docs/propuesta-de-producto.md](docs/propuesta-de-producto.md). Backlog e historias: [ai-context/backlog.md](ai-context/backlog.md) (issues en GitHub). Specs: [specs/](specs/README.md).

| Parte | Repositorio | URL desplegada |
| --- | --- | --- |
| Base de datos (PostgreSQL 17) | este repo (`servicio_back/prisma`) | Render (`servicio-db`, privada; la usa el backend) |
| Backend (NestJS) | este repo | https://servicio-back.onrender.com/api/v1 · Swagger: https://servicio-back.onrender.com/api |
| Frontend (React) | [JulioOliva23/frontPF](https://github.com/JulioOliva23/frontPF) | https://front-pf-three.vercel.app |

## Equipo

| Integrante | GitHub |
| --- | --- |
| Julio Oliva | [@JulioOliva23](https://github.com/JulioOliva23) |
| Fabricio Pinto Lozada | [@fabriciopintolozada-11](https://github.com/fabriciopintolozada-11) |
| Sergio Miguel Cisneros Salazar | [@sergioCisneros17](https://github.com/sergioCisneros17) |

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
| `TRUST_PROXY` | `true` detrás del proxy del hosting, para que el rate limit sea por cliente |

## Despliegue

| Parte | Servicio | Configuración |
| --- | --- | --- |
| Base de datos | [Render](https://render.com) PostgreSQL 17 | Definida en [`render.yaml`](render.yaml); las migraciones se aplican solas al arrancar el backend |
| Backend | [Render](https://render.com) (web service) | Blueprint [`render.yaml`](render.yaml) |
| Frontend | [Vercel](https://vercel.com) | Ver el README de [frontPF](https://github.com/JulioOliva23/frontPF) |

1. **Render:** *New → Blueprint* sobre este repo. Crea la base `servicio-db` y el servicio `servicio-back`, y conecta `DATABASE_URL` sola. Completar `UNLOCK_CODE_ENCRYPTION_KEY` (`openssl rand -hex 32`) y `CORS_ORIGINS` (URL del frontend). Los secretos JWT se generan solos. Cada push a `main` redespliega cuando la CI pasa; al arrancar corre `prisma migrate deploy` (`npm run start:prod`).
2. **Datos demo** (una sola vez, desde tu máquina, con la *External Database URL* de `servicio-db` en Render → Connect):

   ```bash
   cd servicio_back
   DATABASE_URL="<External Database URL>?sslmode=require" SEED_PASSWORD="<contraseña demo>" npm run prisma:seed
   ```

3. Verificar `https://<backend>.onrender.com/api` (Swagger). El plan gratuito de Render se duerme tras 15 min sin tráfico: la primera petición tarda ~1 min. La base gratuita de Render vence a los 30 días de creada (se puede pasar a un plan pago o recrear).

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

### Hooks

| Hook | Dónde | Qué hace |
| --- | --- | --- |
| Git `pre-commit` | [`scripts/hooks/hook-pre-commit.sh`](scripts/hooks/hook-pre-commit.sh) (Husky, se instala con `npm install` en la raíz) | Bloquea el commit si hay un `.env` en stage o si fallan lint, typecheck o tests del paquete modificado |
| Claude Code `PreToolUse` | [`.claude/settings.json`](.claude/settings.json) → [`claude-guard.sh`](scripts/hooks/claude-guard.sh) | Impide que el agente lea o edite `.env` reales, corra `prisma migrate reset/dev`, `db push`, `DROP/TRUNCATE`, `git push --force` o `git commit --no-verify` |
| Claude Code `PostToolUse` | [`.claude/settings.json`](.claude/settings.json) → [`claude-post-edit.sh`](scripts/hooks/claude-post-edit.sh) | Tras cada edición de un `.ts` de `servicio_back` corre ESLint sobre el archivo y sus tests relacionados; si fallan, el agente recibe el error y lo corrige |
| Dominio | `src/modules/work-orders/hooks/` | Precondiciones del flujo, Stock Guard y auditoría, ejecutados antes de cada transición de la OT, con tests propios |

### CI/CD

| Workflow | Jobs | Cuándo |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | `quality`: lint, typecheck, tests unitarios con cobertura y build · `e2e`: Supertest contra PostgreSQL 17 (servicio de GitHub Actions) | Push a `main` y cada PR |
| [`hooks-and-agents.yml`](.github/workflows/hooks-and-agents.yml) | `git-hooks`: hook pre-commit sobre el diff · `claude-hooks`: prueba los casos permitidos/bloqueados de `claude-guard.sh` · `subagents`: valida el frontmatter de los subagentes | Push a `main` y cada PR |

Cada job publica un reporte en el resumen del run (Actions → run → Summary). **Despliegue continuo:** Render redespliega `main` solo cuando todos los checks pasan (`autoDeployTrigger: checksPass` en [`render.yaml`](render.yaml)).

### Subagentes

Definidos en [`.claude/agents/`](.claude/agents/) (detalle en [`.ai/README.md`](.ai/README.md)):

| Agente | Cuándo usarlo |
| --- | --- |
| `@agent-domain-architect` | Esquema Prisma, migraciones, índices, triggers, atomicidad |
| `@agent-api-core` | Endpoints, DTOs, services, repositories y RBAC |
| `@agent-qa-security` | Tests unitarios/e2e y auditoría de seguridad |

## Flujo de trabajo

Ramas `feat/*`, `fix/*` y `docs/*` desde `main`, integradas con Pull Request revisado por otro integrante y con la CI en verde (`main` protegida). Commits con [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `ci:`, `chore:`).
