# AI_CONTEXT — Sistema de Gestión para Servicio Técnico de Celulares

Fuente de verdad para cualquier agente de IA (Claude Code, Cursor, subagentes en `.ai/agents/`) y para el equipo. Si una instrucción de un prompt contradice este archivo, **gana este archivo** y se reporta la contradicción.

Arquitectura heredada del proyecto *P04 — Taller Mecánico* (`pdis/`): mismo stack, mismas capas, mismas convenciones `GEN-`/`BE-`. Solo cambia el dominio. Las reglas técnicas detalladas viven en [`ai-context/constitution/`](ai-context/constitution/).

---

## 1. Stack (sin cambios respecto al proyecto base)

| Capa | Tecnología |
| --- | --- |
| Runtime | Node.js 24 LTS · npm 11 (único gestor, `package-lock.json` versionado) |
| Lenguaje | TypeScript **6.0.x**, `strict: true`, `any` prohibido |
| Backend | NestJS 11 · Prisma 7 (`prisma-client` + `@prisma/adapter-pg`) · PostgreSQL 17 |
| Validación | `class-validator` + `class-transformer` · `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` |
| Auth | Passport JWT (access 15m + refresh 7d con denylist `revoked_refresh_tokens`) · `argon2` |
| Docs API | `@nestjs/swagger` en `/api`; el front genera tipos con `openapi-typescript` |
| Tests | Jest (`unit-tests/`, repositorios mockeados) · Supertest e2e (`test/`, Postgres real) |
| Frontend (fase 2) | React 19 + Vite + React Query + react-hook-form + zod (estructura de `taller_front`) |

## 2. Estructura de carpetas

```text
PF/
├── AI_CONTEXT.md                 ← este archivo
├── .cursorrules / CLAUDE.md      ← punteros a este archivo
├── .ai/agents/                   ← subagentes (.claude/agents → symlink)
├── .husky/pre-commit             → scripts/hooks/hook-pre-commit.sh
├── ai-context/
│   ├── constitution/             ← GEN · BE · FE · TL
│   ├── supuestos.md              ← SUP-xx
│   └── backlog.md                ← US-xx de servicio_front
├── tools/docker-compose.yml      ← PostgreSQL 17 local (puerto 5433)
└── servicio_back/                ← (antes taller_back)
    ├── prisma/schema.prisma      ← esquema del nuevo dominio
    ├── prisma/migrations/        ← init_phone_repair · add_work_order_tracking_code (aplicadas)
    ├── prisma/sql/immutable-audit.sql
    ├── src/common/               ← guards, decorators, filters, enums, crypto
    ├── src/domain/               ← lógica pura sin Nest/Prisma (state machine, IMEI)
    ├── src/modules/<feature>/    ← controller → service → repository (+ dto/, hooks/)
    └── unit-tests/ · test/
```

Capas (BE-05): `controller → service → repository → Prisma`. `PrismaService` solo se inyecta en `repositories/`. Las transacciones se abren en un repositorio y se pasan como `Prisma.TransactionClient`.

## 3. Mapeo de dominio (Taller ➔ Servicio Técnico)

| Taller mecánico (base) | Servicio técnico (nuevo) | Código |
| --- | --- | --- |
| `Vehicle` (placa, marca, modelo, año, eléctrico) | Dispositivo (IMEI, modelo, color) | `Device`, `DeviceModel` |
| `TechnicalHistory` | Historial de reparaciones por IMEI | consulta sobre `WorkOrder` por `deviceId` |
| `WorkOrder` (reclamo inicial, mecánico) | Orden de Trabajo: problema reportado, diagnóstico preliminar, batería %, check-in cosmético, tipo de bloqueo + código cifrado, fecha compromiso | `WorkOrder` |
| `Diagnostic` | Diagnóstico preliminar (campo de la OT) | `WorkOrder.preliminaryDiagnosis` |
| `Quote` / `QuotePart` / `QuoteDetail` / `QuoteApproval` | Presupuesto técnico versionado con ítems de labor y repuestos, vencimiento y decisión | `Budget`, `BudgetItem` |
| `SparePart` (categoría MOTOR…) | Repuesto electrónico (OLED/LCD, batería, flex, cámara, SMD/IC), costo y precio taller, stock mínimo | `SparePart` |
| — | Compatibilidad multi-modelo | `SparePartCompatibility` |
| `StockMovement` (kardex) | Igual: `IN · RESERVE · RELEASE · OUT · ADJUSTMENT` | `StockMovement` |
| — (no existía) | Auditoría inmutable de estados | `WorkOrderStatusAudit` |
| `WorkBay`, `Warranty`, `Settlement`, `AdditionalFinding`, `InventoryDiscrepancy` | **Fuera del MVP** (ver §8) | — |
| Roles `RECEPTIONIST · MECHANIC · WORKSHOP_LEAD · ADMIN` | `ADMIN · RECEPTIONIST · TECHNICIAN · CUSTOMER` | `UserRole` |

Vocabulario fijo (GEN-02): código en inglés, documentación y etiquetas de UI en español.

## 4. Reglas de negocio (RN)

| ID | Regla |
| --- | --- |
| RN-01 | Ningún equipo entra al servicio sin OT. La OT captura problema reportado, check-in cosmético (JSON por zonas), batería % (0–100) y tipo de bloqueo. |
| RN-02 | El IMEI tiene 15 dígitos y pasa Luhn (`src/domain/devices/imei.ts`). Es único por dispositivo. |
| RN-03 | El código de desbloqueo **nunca** se guarda en texto plano: AES-256-GCM (`UnlockCodeCipher`). Se cifra (no hash) porque el técnico necesita probar el equipo. Solo el técnico asignado o ADMIN lo puede revelar y cada revelado se audita. Jamás aparece en logs ni en DTOs de listado. |
| RN-04 | La OT sigue la máquina de estados de §5. Toda transición pasa por `WorkOrderTransitionService`; está prohibido escribir `status` desde otro lugar. |
| RN-05 | Ninguna reparación ni consumo de repuestos sin aprobación explícita del cliente sobre un presupuesto vigente. |
| RN-06 | Un técnico solo ve y modifica las OTs asignadas a él. |
| RN-07 | `unitCost` solo lo ve ADMIN. Los técnicos no ven precios de venta ni tienen acceso a presupuestos (DTO de salida por rol). El cliente ve solo el total de su presupuesto vigente. |
| RN-08 | El presupuesto vence a los `BUDGET_VALIDITY_DAYS` (7 por defecto). Vencido no se puede aprobar: se emite una nueva versión. Las versiones anteriores quedan `SUPERSEDED`, nunca se borran. |
| RN-09 | **Stock Guard:** entrar a `IN_REPAIR` reserva atómicamente los repuestos del presupuesto aprobado; si falta stock, la transición se bloquea (`422 INSUFFICIENT_STOCK`). Entrar a `QUALITY_CONTROL` descuenta el stock físico reservado. |
| RN-10 | Un repuesto solo puede presupuestarse para un `DeviceModel` con el que es compatible. |
| RN-11 | Alerta de stock bajo cuando `availableStock <= minStock`. Invariante: `available = physical − reserved ≥ 0` (CHECK en BD). |
| RN-12 | **Audit Trail:** cada cambio de estado inserta en `work_order_status_audits` (`created_at`, `user_id`, `previous_status`, `new_status`, `reason`). Tabla append-only reforzada por trigger. |
| RN-13 | El historial de reparaciones por IMEI es permanente; buscar un IMEI en recepción muestra las OTs previas. |
| RN-14 | El cliente solo consulta el estado de sus propias OTs (sin costos internos, sin código de desbloqueo, sin notas técnicas). Dos modos (SUP-05): cuenta `CUSTOMER`, o número de OT + código de seguimiento (hash argon2, nunca el PIN del equipo). |
| RN-15 | Importes en `Decimal(12,2)`, moneda `BOB` por defecto. `Float` prohibido. |

Cita el ID en el código cuando justifica una validación: `// RN-09: block repair start without stock`.

## 5. Máquina de estados de la OT

| Enum | Etiqueta UI |
| --- | --- |
| `RECEIVED` | Ingresado |
| `IN_DIAGNOSIS` | En Diagnóstico |
| `BUDGETED` | Presupuestado |
| `APPROVED` | Aprobado |
| `IN_REPAIR` | En Reparación |
| `QUALITY_CONTROL` | Control de Calidad |
| `READY_FOR_DELIVERY` | Listo para Entrega |
| `DELIVERED` | Entregado |
| `CANCELLED` | Cancelado (rechazo / vencimiento) |

```text
RECEIVED ─▶ IN_DIAGNOSIS ─▶ BUDGETED ─▶ APPROVED ─▶ IN_REPAIR ─▶ QUALITY_CONTROL ─▶ READY_FOR_DELIVERY ─▶ DELIVERED
   │             │             │                        ▲   [Stock Guard]   │
   └─────────────┴─────────────┴──▶ CANCELLED ──▶ DELIVERED   └──── rework ─┘
```

La tabla de transiciones y los roles permitidos están en `src/domain/work-orders/work-order-state-machine.ts` (fuente única). Ilegal → `409`; rol no permitido → `403`; técnico no asignado → `403`.

## 6. Los 5 módulos prioritarios

### 6.1 Auth & RBAC — `modules/auth`, `modules/users`, `common/guards`
- `POST /auth/login`, `/auth/refresh` (rotación + denylist por `jti`; reuso de un `jti` revocado revoca la familia), `/auth/logout`, `GET /auth/profile`.
- `JwtAuthGuard` y `RolesGuard` globales (`APP_GUARD`). `@Public()` solo para login/refresh/swagger y `POST /public/tracking`. `@Roles(...)` en **cada** handler.
- `ThrottlerGuard` en login (10/min por IP) y en `POST /public/tracking` (5/min por IP). `createdBy`/`userId` salen del JWT (BE-19), nunca del body.
- `CUSTOMER` se vincula a un `Customer` mediante `User.customerId`.

### 6.2 Work Orders — `modules/work-orders`
- Recepción: `POST /work-orders` (crea o reutiliza `Device` por IMEI, cifra el código de desbloqueo y devuelve una sola vez el `trackingCode`, SUP-05).
- `POST /work-orders/:id/tracking-code/regenerate` (RECEPTIONIST, ADMIN) y `POST /public/tracking` `{ number, trackingCode }` (público, SUP-05).
- `POST /work-orders/:id/assign-technician` (RECEPTIONIST, ADMIN).
- `POST /work-orders/:id/transitions` `{ to, reason? }` → `WorkOrderTransitionService`.
- `POST /work-orders/:id/unlock-code/reveal` (técnico asignado, ADMIN; auditado).
- `GET /work-orders` paginado `{ data, total, page, pageSize }` con filtro por estado/técnico; `GET /work-orders/:id/audit`.
- Hooks: `hooks/inventory-stock-guard.hook.ts`, `hooks/audit-trail.hook.ts` (ver §7).

### 6.3 Device Registry — `modules/devices`
- `GET /devices/by-imei/:imei` → dispositivo + historial de OTs (RN-13).
- DTOs usan `@Transform(normalizeImei)` + `@IsImei()`.
- Catálogo `DeviceModel` (marca + modelo únicos).

### 6.4 Budgets / Estimates — `modules/budgets`
- `POST /work-orders/:id/budgets` crea versión `DRAFT`: ítems `LABOR` (micro-soldadura, ensamblaje…) y `PART` (validando RN-10). Subtotales y total calculados en el service con `Prisma.Decimal`.
- `POST /budgets/:id/send` → `SENT`, fija `expiresAt`, transiciona la OT a `BUDGETED`.
- `POST /budgets/:id/approve|reject` (`decisionChannel`: IN_PERSON, PHONE, WHATSAPP) → transiciona la OT a `APPROVED` o `CANCELLED`. Rechaza si `expiresAt < now` (RN-08).
- Estados del presupuesto: `DRAFT · SENT · APPROVED · REJECTED · EXPIRED · SUPERSEDED`.

### 6.5 Spare Parts Inventory — `modules/spare-parts`
- CRUD de catálogo con borrado lógico (`isActive`). Categorías: `DISPLAY_OLED · DISPLAY_LCD · BATTERY · CHARGING_FLEX · CAMERA_MODULE · SMD_COMPONENT · IC · OTHER`.
- `POST /spare-parts/:id/stock-entries` (ingreso, kardex `IN`), `POST /spare-parts/:id/adjustments` (ADMIN, con `reason`).
- `GET /spare-parts?deviceModelId=` (compatibles), `GET /spare-parts/alerts/low-stock` (RN-11).
- Toda mutación de stock: `updateMany` condicionado (`where: { availableStock: { gte: q } }`) + fila de kardex en la misma transacción.

## 7. Hooks

| Hook | Tipo | Archivo | Comportamiento |
| --- | --- | --- | --- |
| Workflow Preconditions | Lifecycle de dominio | `…/hooks/workflow-preconditions.hook.ts` | `→ IN_DIAGNOSIS` exige técnico asignado; `→ BUDGETED` exige presupuesto `SENT`; `→ APPROVED` exige presupuesto `APPROVED` (RN-05). |
| Pre-commit | Git (Husky) | `scripts/hooks/hook-pre-commit.sh` | Rechaza `.env` staged; por cada paquete con cambios corre `lint`, `typecheck` y `test`. Cualquier fallo bloquea el commit. |
| Inventory Stock Guard | Lifecycle de dominio | `servicio_back/src/modules/work-orders/hooks/inventory-stock-guard.hook.ts` | En `→ IN_REPAIR` reserva líneas `PENDING`; en `→ QUALITY_CONTROL` consume líneas `RESERVED`. Orden por `sparePartId` para evitar deadlocks. Falta de stock → `422` y rollback total. |
| Audit Trail | Servicio + BD | `…/hooks/audit-trail.hook.ts` + `prisma/sql/immutable-audit.sql` | Inserta la fila de auditoría en la misma transacción (último hook). Trigger PostgreSQL rechaza `UPDATE`/`DELETE`. |

Contrato: `WorkOrderTransitionHook { name; supports(ctx); handle(ctx, tx) }`, registrado en `WORK_ORDER_TRANSITION_HOOKS`. Orden de ejecución dentro de la transacción: *compare-and-set del estado* → `WorkflowPreconditionsHook` → `InventoryStockGuardHook` → `AuditTrailHook`. Un hook nuevo se agrega al factory de `work-order-transitions.module.ts`, antes de `AuditTrailHook`. Otros módulos que deben cambiar su agregado junto con el estado (p. ej. presupuestos) usan `WorkOrderTransitionService.transitionWithin(tx, …)`.

## 8. Estado de la migración

- ✅ Migración inicial `init_phone_repair` **aplicada** en PostgreSQL 17 (`tools/docker-compose.yml`, puerto **5433**, bases `servicio_tecnico` y `servicio_tecnico_test`): 14 tablas.
- ✅ Triggers activos (anexados a la migración desde `prisma/sql/immutable-audit.sql`): `work_order_status_audits`, `unlock_code_access_logs` y `stock_movements` rechazan `UPDATE`/`DELETE`; CHECK `spare_parts_stock_non_negative` garantiza `available = physical − reserved ≥ 0`.
- ✅ Seed de pruebas idempotente disponible: `npm run prisma:seed` (usuarios por rol, 4 modelos, 6 repuestos con compatibilidad; contraseñas desde `SEED_PASSWORD*`).
- ✅ Módulos portados: `auth`, `users`, `devices`, `spare-parts`, `budgets`, `work-orders` (+ `work-order-transitions`).
- ✅ Husky instalado en la raíz (`npm install` → `prepare: husky`); `.husky/pre-commit` delega en `scripts/hooks/hook-pre-commit.sh`. **No usar `npx husky init`**: sobrescribe el hook con `npm test`.
- ✅ Tests: unitarios en `unit-tests/` (`npm test`) y e2e en `test/` (`npm run test:e2e`, base `TEST_DATABASE_URL` separada, migrada automáticamente).
- ❌ No se migran: `work-bays`, `warranties`, `settlements`, `additional-findings`, `inventory-discrepancies`, `public-tracking` (reemplazado por el rol `CUSTOMER`). Reintroducirlos exige un `SUP-xx`.
- ✅ Documentación: [`frontend.md`](ai-context/constitution/frontend.md), [`tools.md`](ai-context/constitution/tools.md), [`supuestos.md`](ai-context/supuestos.md), [`backlog.md`](ai-context/backlog.md).
- ✅ SUP-05 confirmado e implementado (código de seguimiento + `POST /public/tracking`).
- ✅ Migración `20261019120000_add_work_order_tracking_code` aplicada el 2026-10-19 en `servicio_tecnico` y `servicio_tecnico_test` (columna `work_orders.tracking_code_hash`, nullable).
- ⏭ Pendiente: implementar `servicio_front` según `backlog.md`.

### Arranque local

Guía completa en [`tools.md`](ai-context/constitution/tools.md).

```bash
docker compose -f tools/docker-compose.yml up -d --wait
cd servicio_back && npm install && npx prisma migrate deploy && npm run prisma:seed && npm run start:dev
```

## 9. Reglas de estilo obligatorias

1. **Clean Code:** funciones cortas y con un solo propósito; nombres con significado de dominio; sin comentarios que repitan el código; los comentarios citan `RN-`/`BE-`.
2. **Modularidad desacoplada:** un módulo por dominio funcional; los módulos se comunican por servicios exportados, nunca importando repositorios ajenos. La lógica pura va en `src/domain/` y no importa Nest ni Prisma.
3. **Tipado estricto:** `strict`, sin `any` (usar `unknown` + narrowing), enums TS para todo `status`/`type`, DTO de entrada ≠ modelo Prisma ≠ DTO de salida.
4. **Validación exhaustiva en la entrada:** todo body/query/param pasa por un DTO con `class-validator`; `ParseUUIDPipe` en ids; longitudes máximas en todos los strings; números con `@Min/@Max`.
5. **Errores:** los services lanzan excepciones Nest semánticas (`400/401/403/404/409/422`); `AllExceptionsFilter` traduce errores Prisma (`P2002`, `P2025`) sin filtrar detalles internos.
6. **Tests unitarios obligatorios** para cada service/hook/función de dominio, nombrados en inglés citando la regla: `it('blocks IN_REPAIR when a budget part has no stock (RN-09)')`. Cada RN tiene al menos un test.
7. **Seguridad:** sin secretos en el repo (`.env.example` versionado), sin `console.log`, sin SQL crudo con interpolación (usar Prisma o `Prisma.sql`), nunca loguear el código de desbloqueo ni tokens.
8. **Git:** Conventional Commits en inglés (`feat(budgets): add expiration check`), ramas `feat/<us-id>-<slug>`, sin push directo a `main`.

## 10. Definition of Done

- [ ] `npm run lint`, `npm run typecheck` y `npm test` pasan (lo garantiza el pre-commit).
- [ ] Cada endpoint tiene `@Roles`, DTOs validados y decoradores Swagger.
- [ ] Cada RN tocada tiene test que la cubre.
- [ ] Nada escribe `WorkOrder.status` fuera de `WorkOrderTransitionService`.
- [ ] Supuestos nuevos registrados como `SUP-xx` y marcados en código: `// SUP-NN: …`.
