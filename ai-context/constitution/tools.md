# Reglas de tooling — TL (Servicio Técnico de Celulares)

Entorno local, base de datos, datos de prueba, tests, hooks y CI. Requiere haber leído [00-general.md](00-general.md).

---

## Requisitos

### TL-01
**Herramientas del equipo**

**MUST.** Node.js 24 LTS, npm 11 (único gestor, GEN-04), Docker Desktop con Compose v2, Git. No se requiere `psql` local: se usa `docker exec` sobre el contenedor.

## Base de datos local

### TL-02
**PostgreSQL 17 en Docker, puerto 5433**

**MUST.** La base de desarrollo vive en `tools/docker-compose.yml` (servicio `postgres`, contenedor `servicio-postgres`, volumen `servicio-postgres-data`). Usa el puerto **5433** para no chocar con el proyecto del taller (5432).

```bash
# Levantar (espera al healthcheck)
docker compose -f tools/docker-compose.yml up -d --wait

# Estado y logs
docker compose -f tools/docker-compose.yml ps
docker compose -f tools/docker-compose.yml logs -f postgres

# Consola SQL
docker exec -it servicio-postgres psql -U servicio -d servicio_tecnico

# Detener (conserva los datos)
docker compose -f tools/docker-compose.yml down
```

Credenciales de desarrollo (solo locales, sobrescribibles con `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`): usuario `servicio`, base `servicio_tecnico`.

**MUST NOT.** `docker compose down -v` borra el volumen y todos los datos. Requiere confirmación explícita (CLAUDE.md).

### TL-03
**Base de pruebas separada**

**MUST.** Los tests e2e usan `servicio_tecnico_test` en el mismo contenedor, nunca la base de desarrollo. Se crea una sola vez:

```bash
docker exec servicio-postgres psql -U servicio -d postgres -c "CREATE DATABASE servicio_tecnico_test"
```

Las migraciones de esa base las aplica automáticamente `test/global-setup.ts` (`prisma migrate deploy`) al correr `npm run test:e2e`.

## Migraciones y datos

### TL-04
**Migraciones**

**MUST.** Todas las órdenes se ejecutan desde `servicio_back/`.

```bash
npx prisma migrate deploy        # aplica las migraciones versionadas (entorno compartido / CI)
npx prisma generate              # regenera el cliente en src/generated/prisma
npx prisma migrate status        # verifica el estado
```

**MUST.** Un cambio de esquema se crea con `npm run prisma:migrate -- --name <english_name>` **solo** con confirmación humana explícita (CLAUDE.md, BE-20). Prohibido `prisma db push` y `prisma migrate reset` en bases compartidas. Si se agrega una tabla append-only, su trigger se suma a `prisma/sql/immutable-audit.sql` y se anexa a la migración (`--create-only`, editar, aplicar).

### TL-05
**Seed idempotente**

**MUST.** `npm run prisma:seed` solo hace upserts (no borra nada) y crea: `admin01`, `recep01`, `tecnico01`, `tecnico02`, `cliente01` (rol `CUSTOMER`, vinculado a la clienta demo), 4 modelos (iPhone 13, iPhone 13 Pro, Galaxy A54, Redmi Note 12) y 6 repuestos con compatibilidad, incluido uno con stock 0 y otro bajo el mínimo para probar alertas (RN-11). Las contraseñas salen de `SEED_PASSWORD` o `SEED_PASSWORD_<ROLE>`; nunca se escriben en el script.

## Ejecución y pruebas

### TL-06
**Arranque**

```bash
cd servicio_back
npm install
npx prisma migrate deploy && npm run prisma:seed
npm run start:dev            # http://localhost:3000/api/v1 · Swagger en http://localhost:3000/api
```

### TL-07
**Suites de prueba**

**MUST.** Todas pasan antes de abrir un MR (GEN-12).

| Comando (en `servicio_back/`) | Qué ejecuta | Requiere BD |
| --- | --- | --- |
| `npm run lint` | ESLint sobre `src`, `test`, `unit-tests`, `prisma` | No |
| `npm run typecheck` | `tsc --noEmit` estricto | No |
| `npm test` | Jest unitario (`unit-tests/`, repositorios mockeados) | No |
| `npm run test:e2e` | Supertest sobre `AppModule` real contra `servicio_tecnico_test` | Sí (TL-03) |
| `npm run build` | `prisma generate` + `nest build` → `dist/main.js` | No |

La suite e2e cubre la carrera por la última unidad de stock (RN-09), el rollback del Stock Guard, la inmutabilidad del audit trail por trigger (RN-12), el revelado auditado (RN-03), el vencimiento de presupuestos (RN-08), el RBAC por rol y la consulta pública por código de seguimiento con su rate limit (SUP-05).

**Nota:** los rate limits (login 10/min, consulta pública 5/min) son por IP y en memoria. El bloque SUP-05 del e2e hace exactamente 5 consultas públicas y espera `429` en la sexta; si se agregan casos ahí hay que mantener la cuenta.

## Hooks y CI

### TL-08
**Pre-commit con Husky**

**MUST.** `npm install` en la raíz `PF/` ejecuta `prepare: husky`, que configura `core.hooksPath=.husky/_`. `.husky/pre-commit` delega en `scripts/hooks/hook-pre-commit.sh`, que:

1. Rechaza cualquier `.env` staged (excepto `.env.example`).
2. Por cada paquete con archivos staged ejecuta `lint`, `typecheck` y `test`.
3. Bloquea el commit si algo falla.

```bash
# Correr el hook a mano sobre lo que está staged
./scripts/hooks/hook-pre-commit.sh
```

**MUST NOT.** `npx husky init` reemplaza `.husky/pre-commit` por `npm test` y desactiva las verificaciones. Prohibido `git commit --no-verify` salvo emergencia documentada en el MR.

### TL-09
**CI (GitLab)**

**MUST.** `servicio_back/.gitlab-ci.yml` ejecuta `lint` + `typecheck`, luego `npm test` y `npm run test:e2e` con un servicio `postgres:17-alpine`, y por último `build`. Las variables de CI son valores de prueba, nunca secretos reales.

## Variables de entorno

### TL-10
**`.env.example` es el contrato**

**MUST.** Toda variable nueva se agrega a `servicio_back/.env.example` en el mismo MR, y si es obligatoria también al esquema Joi de `app.module.ts` (BE-30). El `.env` real nunca se versiona (GEN-11; lo impide el pre-commit).

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Sí | PostgreSQL de desarrollo (`…@localhost:5433/servicio_tecnico`) |
| `TEST_DATABASE_URL` | Para e2e | Base de pruebas (`…@localhost:5433/servicio_tecnico_test`) |
| `JWT_SECRET` | Sí | ≥ 32 caracteres |
| `JWT_REFRESH_SECRET` | Sí | ≥ 32 caracteres, distinto del anterior |
| `JWT_EXPIRES_IN` | Sí | p. ej. `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Sí | p. ej. `7d` |
| `UNLOCK_CODE_ENCRYPTION_KEY` | Sí | 64 caracteres hex (AES-256-GCM, RN-03). Cambiarla deja ilegibles los códigos ya guardados |
| `BUDGET_VALIDITY_DAYS` | No (7) | Vigencia del presupuesto (RN-08), 1–90 |
| `LABOR_HOURLY_RATE` | No (80) | Tarifa de referencia de mano de obra |
| `PORT` | No (3000) | Puerto HTTP |
| `CORS_ORIGINS` | No | Lista separada por comas; vacío = cualquier origen (solo desarrollo) |
| `SEED_PASSWORD` / `SEED_PASSWORD_<ROLE>` | Para el seed | Contraseñas demo |

Generar secretos locales:

```bash
openssl rand -hex 32      # UNLOCK_CODE_ENCRYPTION_KEY
openssl rand -hex 24      # JWT_SECRET / JWT_REFRESH_SECRET
```
