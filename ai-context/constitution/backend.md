# Reglas de backend — BE (Servicio Técnico de Celulares)

Repo `servicio_back` · NestJS + Prisma + PostgreSQL.

Requiere haber leído [00-general.md](00-general.md). Las reglas de idioma ([GEN-01](00-general.md#gen-01)), vocabulario ([GEN-02](00-general.md#gen-02)), reglas de negocio ([GEN-08](00-general.md#gen-08)) y supuestos ([GEN-09](00-general.md#gen-09)) aplican aquí sin repetirse.

---

## Stack

### BE-01
**Versiones del backend**

**MUST.** Verificadas contra npm en agosto de 2026.

| Paquete | Versión |
| --- | --- |
| `@nestjs/core`, `@nestjs/common` | 11.x |
| `@nestjs/cli` | 11.x |
| `prisma`, `@prisma/client` | 7.x |
| `@prisma/adapter-pg` | 7.x |
| `@nestjs/swagger` | 11.x |
| `class-validator` / `class-transformer` | 0.15.x / 0.5.x |
| `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt` | últimas compatibles con Nest 11 |
| TypeScript | 6.0.x — ver [GEN-05](00-general.md#gen-05) |

---

## Estructura de carpetas

### BE-02
**Feature-first: un módulo por área del servicio, con sus capas dentro**

**MUST.** La estructura es esta y no se improvisa:

```text
src/
├── domain/                 # Lógica pura sin Nest/Prisma
│   ├── work-orders/work-order-state-machine.ts   # RN-04
│   └── devices/imei.ts                           # RN-02 (Luhn)
├── modules/
│   ├── auth/               # JWT, refresh tokens, logout
│   ├── users/              # ADMIN, RECEPTIONIST, TECHNICIAN, CUSTOMER
│   ├── work-orders/        # OTs, asignación, transiciones
│   │   ├── dto/
│   │   ├── hooks/          # inventory-stock-guard, audit-trail (RN-09, RN-12)
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── work-orders.controller.ts
│   │   └── work-orders.module.ts
│   ├── devices/            # Registro por IMEI e historial (RN-02, RN-13)
│   ├── budgets/            # Presupuestos versionados, vencimiento, aprobación (RN-05, RN-08)
│   ├── spare-parts/        # Catálogo, stock, compatibilidad, alertas (RN-10, RN-11)
│   └── config/
├── common/
│   ├── crypto/             # UnlockCodeCipher (RN-03)
│   ├── decorators/         # @Roles, @CurrentUser, @Public
│   ├── enums/
│   ├── filters/
│   └── guards/             # JwtAuthGuard, RolesGuard
├── prisma/
├── generated/prisma/       # No se edita a mano
├── app.module.ts
└── main.ts
```

Fuera de `src/`: `prisma/schema.prisma`, `prisma/migrations/`, `prisma/sql/`, `unit-tests/` y `test/` (e2e).

### BE-03
**Un módulo por dominio funcional, no por tabla**

**SHOULD.** `work-orders` agrupa OT, asignación de técnico y transiciones. `spare-parts` agrupa catálogo, stock, compatibilidad y kardex. `budgets` agrupa versiones, ítems y decisión.

### BE-04
**Nomenclatura de archivos**

**MUST.** Usar `kebab-case` con sufijo de rol: `work-orders.controller.ts`, `work-orders.service.ts`, `work-order.repository.ts`, `create-work-order.dto.ts`, `roles.guard.ts`. Usar singular para la entidad (`device.repository.ts`) y plural para el agrupador del módulo (`devices.service.ts`).

---

## Capas y Responsabilidades

### BE-05
**Dirección estricta de dependencias**

**MUST.** `controller → service → repository → Prisma`. Está prohibido saltarse capas o inyectar en sentido inverso.

| Capa | Responsabilidad | Prohibido |
| --- | --- | --- |
| Controller | Recibir HTTP, validar DTOs, delegar al service y retornar respuesta | Lógica de negocio e interacción con Prisma |
| Service | Orquestar reglas de negocio (RN-01 a RN-15) y transacciones | Conocer `Request`, `Response` o status HTTP |
| Repository | Consultas y persistencia en base de datos | Validaciones y reglas de negocio |

### BE-06
**El controller no contiene lógica de negocio**

**MUST.** El controller solo recibe, delega y devuelve.

```ts
// ✅
@Post(':id/transitions')
@Roles(UserRole.TECHNICIAN, UserRole.RECEPTIONIST, UserRole.ADMIN)
transition(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: TransitionWorkOrderDto,
  @CurrentUser() user: AuthenticatedUser,
): Promise<WorkOrderStatusResponseDto> {
  return this.transitions.transition({ workOrderId: id, to: dto.to, reason: dto.reason, userId: user.id, role: user.role });
}

// ❌ Regla de negocio y Prisma en el controller
@Post(':id/transitions')
async transition(@Param('id') id: string, @Body() dto: TransitionWorkOrderDto) {
  if (dto.to === WorkOrderStatus.IN_REPAIR) { /* check stock here */ }
  return this.prisma.workOrder.update({ where: { id }, data: { status: dto.to } });
}
```

### BE-07
**El service es agnóstico del protocolo HTTP**

**MUST.** Los services lanzan excepciones de dominio (`NotFoundException`, `ConflictException`, `UnprocessableEntityException`, `ForbiddenException`). El filtro global se encarga de traducirlas al cliente HTTP.

### BE-08
**Acceso a datos exclusivo mediante repositories**

**MUST.** `PrismaService` solo se inyecta en clases bajo `repositories/`. Un service que inyecte `PrismaService` directamente será motivo de rechazo del MR.

**Excepción:** métodos transaccionales complejos (BE-16) donde el service coordina repositorios pasándoles la instancia de transacción `Prisma.TransactionClient`.

### BE-09
**Los repositories exponen métodos con significado de dominio**

**SHOULD.** El repositorio expone operaciones semánticas (`findExpiredSentBudgets(now)`, `findBelowMinStock()`, `findAssignedToTechnician(technicianId)`), evitando exponer `findMany` genéricos que fuercen al service a construir cláusulas `where` de Prisma.

## DTOs y Validación

### BE-10
**Validación estricta con class-validator**

**MUST.** Todo payload entrante pasa por un DTO fuertemente tipado.

```ts
export class RegisterDeviceIntakeDto {
  @Transform(({ value }) => (typeof value === 'string' ? normalizeImei(value) : value))
  @IsImei() // RN-02
  imei: string;

  @IsString() @Length(5, 1000)
  reportedProblem: string;

  @IsInt() @Min(0) @Max(100)
  batteryLevel: number;

  @IsEnum(LockType)
  lockType: LockType; // NONE | PIN | PATTERN | PASSWORD

  @ValidateIf((dto: RegisterDeviceIntakeDto) => dto.lockType !== LockType.NONE)
  @IsString() @Length(1, 64)
  unlockCode?: string; // RN-03: encrypted in the service, never persisted raw
}
```

### BE-11
**ValidationPipe global estricto**

**MUST.** En `main.ts`:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

### BE-12
**Separación estricta de DTOs y modelos de base de datos**

**MUST.** Existen tres representaciones desacopladas: DTO de entrada, modelo Prisma y DTO de respuesta.

**MUST.** La respuesta de una OT o repuesto para `TECHNICIAN` y `CUSTOMER` excluye `unitCost`; para `TECHNICIAN` también los precios de venta (RN-07). `unlockCodeCipher` nunca se serializa.

### BE-13
**Manejo monetario (RN-15) sin punto flotante**

**MUST.** Importes en `Decimal(12,2)` y aritmética con `Prisma.Decimal`. Prohibido `Float` y `number` para dinero.

## Persistencia y Prisma 7

### BE-14
**Configuración de Prisma 7**

**MUST.** Configuración obligatoria en `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

La URL vive en `prisma.config.ts` (`env('DATABASE_URL')`), como en Prisma 7.

### BE-15
**PrismaService unificado**

**MUST.** Existirá un único `PrismaService`, gestionado por el ciclo de vida de Nest (`OnModuleInit`) dentro de `PrismaModule`. Está prohibido instanciar `new PrismaClient()` fuera de este servicio.

### BE-16
**Transacciones atómicas obligatorias para movimientos de stock y cambios de estado**

**MUST.** Se ejecutan dentro de `$transaction`:

- RN-04 / RN-12: toda transición de OT junto con su fila de auditoría (`WorkOrderTransitionService`).
- RN-09: reserva al entrar a `IN_REPAIR` y consumo al entrar a `QUALITY_CONTROL` (Stock Guard).
- Ingresos y ajustes de stock con su fila de kardex.

**MUST.** Las mutaciones de stock son `updateMany` condicionados (`availableStock: { gte: q }`) y verifican `count === 1`; nunca *leer-calcular-escribir*.

### BE-17
**Inmutabilidad del historial y trazabilidad (RN-12, RN-13)**

**MUST.** `work_order_status_audits` y `stock_movements` son solo inserción, reforzado con trigger (`prisma/sql/immutable-audit.sql`). Prohibido el `DELETE` físico de OTs, dispositivos y presupuestos.

### BE-18
**Borrado lógico para usuarios y catálogo**

**MUST.** Usuarios y repuestos del catálogo se desactivan (`isActive: false` o `deactivatedAt: DateTime`).

### BE-19
**Campos de auditoría inyectados por el backend**

**MUST.** `createdBy`, `assignedBy`, `voidedBy`, `approvedBy` y sus timestamps se obtienen exclusivamente del token JWT del usuario autenticado. Jamás se aceptan en el cuerpo del request.

### BE-20
**Migraciones versionadas**

**MUST.** Gestionar los esquemas mediante `npx prisma migrate dev --name <nombre_en_ingles>`. Está prohibido usar `prisma db push` en entornos compartidos.

### BE-21
**Convenciones del esquema e índices de rendimiento**

**MUST.** Modelos en PascalCase singular, campos en camelCase, tablas y columnas en snake_case con `@@map`/`@map`.

**MUST.** Índices en: `devices.imei` (único, RN-13), `work_orders(device_id, created_at)`, `work_orders(status, created_at)`, `work_orders(technician_id, status)` (RN-06), `budgets(status, expires_at)` (RN-08), `spare_parts(available_stock, min_stock)` (RN-11), `work_order_status_audits(work_order_id, created_at)`.

## API y Seguridad

### BE-22
**Diseño RESTful en inglés**

**MUST.** Recursos en plural: `/api/v1/work-orders`, `/api/v1/devices`, `/api/v1/budgets`, `/api/v1/spare-parts`.

Acciones de dominio como sub-recursos:

- `POST /api/v1/work-orders/:id/transitions` (RN-04)
- `POST /api/v1/work-orders/:id/assign-technician` (RN-06)
- `POST /api/v1/work-orders/:id/unlock-code/reveal` (RN-03, auditado)
- `POST /api/v1/budgets/:id/approve` · `/reject` · `/send` (RN-05, RN-08)
- `GET /api/v1/devices/by-imei/:imei` (RN-13)
- `GET /api/v1/spare-parts/alerts/low-stock` (RN-11)

### BE-23
**Códigos HTTP semánticos**

**MUST.** Usar `201` creado, `200` éxito, `204` sin contenido, `400` validación DTO, `401` no autenticado, `403` sin permiso según rol, `404` no encontrado, `409` conflicto de estado y `422` regla de negocio violada.

### BE-24
**Listados paginados**

**MUST.** Todo listado responde con `{ data, total, page, pageSize }`.

### BE-25
**Documentación OpenAPI / Swagger obligatoria**

**MUST.** Todo endpoint debe estar decorado con `@ApiOperation`, `@ApiResponse` y DTOs con `@ApiProperty` para permitir la generación de tipos en el frontend.

### BE-26
**Filtro global de excepciones**

**MUST.** Usar un `AllExceptionsFilter` unificado. Los códigos de error de Prisma (por ejemplo, `P2002` y `P2025`) se capturan y traducen a excepciones HTTP estándar sin exponer detalles internos de la base de datos.

### BE-27
**Autenticación JWT**

**MUST.** Los access tokens y refresh tokens se firman mediante Passport JWT. Las claves y los tiempos son configurables mediante variables de entorno.

### BE-28
**Contraseñas seguras**

**MUST.** Usar hashing mediante `argon2` o `bcrypt`. Los hashes nunca forman parte de los DTOs de salida.

### BE-29
**Autorización basada en roles (RBAC)**

**MUST.** `JwtAuthGuard` y `RolesGuard` globales; `@Public()` solo en login, refresh y Swagger. Todo handler declara `@Roles(...)`.

- RN-06: `TECHNICIAN` solo lee/modifica OTs con `technicianId = user.id` (validado en el service, no solo en el guard).
- RN-14: `CUSTOMER` solo lee OTs con `customerId = user.customerId`, vía DTO reducido.
- Ajustes de inventario y gestión de usuarios: solo `ADMIN`.

### BE-30
**Validación de configuración en el arranque**

**MUST.** Usar `@nestjs/config` con Joi o Zod. Si falta `DATABASE_URL` o `JWT_SECRET`, la aplicación detiene el bootstrap inmediatamente.

## Testing

### BE-31
**Testing unitario y end-to-end**

**MUST.** Los tests unitarios se escriben en Jest con repositorios mockeados para toda la lógica de negocio en services. Los tests e2e usan Supertest sobre una base de datos PostgreSQL de pruebas.

### BE-32
**Cobertura obligatoria de reglas de negocio en tests**

**MUST.** Cada RN tiene suite dedicada, en especial:

- RN-02: IMEIs válidos, dígito de control erróneo, longitud y caracteres inválidos.
- RN-03: el código nunca aparece en claro en BD, logs ni respuestas; ciphertext alterado falla.
- RN-04: todas las transiciones ilegales → `409`; rol no permitido → `403`.
- RN-08: aprobar un presupuesto vencido → `422`.
- RN-09: `→ IN_REPAIR` sin stock → `422` con rollback completo (e2e con dos OTs compitiendo por la última unidad).
- RN-12: cada transición deja exactamente una fila de auditoría; `UPDATE`/`DELETE` sobre la tabla falla.

### BE-33
**Nomenclatura descriptiva de pruebas**

**SHOULD.** Usar nombres descriptivos en inglés, por ejemplo:

```ts
it('rejects an IMEI with an invalid Luhn check digit (RN-02)');
it('blocks IN_REPAIR when a budget part has no available stock (RN-09)');
```
