# Supuestos — SUP

Registro de supuestos de dominio y decisiones técnicas tomadas sin confirmación explícita del cliente (GEN-09). Cada supuesto indica su estado, riesgo, reglas y US afectadas, y dónde está implementado.

Estados: **Implementado** (en código, pendiente de validar con el cliente) · **Pendiente** (requiere decisión antes de implementar) · **Confirmado** · **Refutado**.

Cuando el código depende de un supuesto se marca así: `// SUP-NN: assumed behavior, pending client confirmation`.

Riesgo: **Alto** (si se refuta, cambia el modelo de datos, la máquina de estados o el alcance) · **Medio** (exige reescribir flujos o permisos) · **Bajo** (ajuste localizado).

| ID | Supuesto | Estado | Riesgo | Reglas | Épica / US | Front | Pregunta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [SUP-01](#sup-01) | IMEI obligatorio y validado con Luhn en el check-in | Implementado | Medio | RN-01, RN-02 | E1 / US-01 | US-F03 | [P-06](preguntas-cliente.md#p-06) |
| [SUP-02](#sup-02) | Stock reservado atómicamente al pasar a reparación; bloqueo si falta | Implementado | Alto | RN-09, RN-11 | E3 / US-15 | US-F07 | [P-09](preguntas-cliente.md#p-09), [P-10](preguntas-cliente.md#p-10) |
| [SUP-03](#sup-03) | Auditoría inmutable reforzada por triggers en BD | Implementado | Bajo | RN-12 | E1 / US-08 | US-F09 | [P-20](preguntas-cliente.md#p-20) |
| [SUP-04](#sup-04) | Los presupuestos técnicos vencen a los 7 días | Implementado | Medio | RN-08 | E2 / US-12 | US-F06, US-F15 | [P-08](preguntas-cliente.md#p-08) |
| [SUP-05](#sup-05) | Portal del cliente: cuenta `CUSTOMER` **y** número de OT + código de seguimiento | **Confirmado** (implementado y migrado) | Alto | RN-03, RN-14 | E4 / US-17, US-18, US-19 | US-F03, US-F10 | [P-18](preguntas-cliente.md#p-18) |
| [SUP-06](#sup-06) | Un dispositivo se identifica por un único IMEI (el principal) | Implementado | Medio | RN-02, RN-13 | E1 / US-01, US-02 | US-F03 | [P-07](preguntas-cliente.md#p-07) |
| [SUP-07](#sup-07) | Refresh token en `sessionStorage` hasta tener cookie `httpOnly` | Pendiente | Medio | — | E1 / US-00 | US-F01 | — (decisión técnica) |
| [SUP-08](#sup-08) | Una OT aprobada no se cancela; no hay liberación de reservas | Implementado | Medio | RN-04, RN-09 | E3 / US-15 | US-F07 | [P-11](preguntas-cliente.md#p-11) |
| [SUP-09](#sup-09) | El código de desbloqueo se cifra (reversible), no se hashea | Implementado | Alto | RN-03 | E1 / US-01, US-07 | US-F03, US-F08 | [P-15](preguntas-cliente.md#p-15), [P-16](preguntas-cliente.md#p-16) |
| [SUP-10](#sup-10) | Moneda única BOB | Implementado | Bajo | RN-15 | E2 / US-09 | US-F05 | [P-21](preguntas-cliente.md#p-21) |

---

### SUP-01
**IMEI obligatorio con validación Luhn en el check-in**

- **Supuesto:** todo equipo que ingresa tiene un IMEI legible (bandeja SIM, caja, etiqueta o `*#06#`) de 15 dígitos cuyo último dígito es el verificador Luhn de los 14 anteriores. Se aceptan espacios y guiones al escribir y se guarda normalizado.
- **Implementación:** `src/domain/devices/imei.ts`, decorador `@IsImei()` en `DeviceCheckInDto`, `ParseImeiPipe` en `GET /devices/by-imei/:imei`. Tests: `unit-tests/imei.spec.ts`, `device-check-in.dto.spec.ts`, e2e.
- **Riesgo:** equipos sin IMEI legible (placa muerta y sin caja) o con IMEI alterado no pueden registrarse.
- **Pregunta al cliente:** ¿se reciben equipos sin IMEI recuperable? Si sí, ¿se registra un identificador interno alternativo?

### SUP-02
**Reserva atómica de stock al pasar a reparación**

- **Pedido original:** "descuento atómico de stock al pasar a reparación, bloqueando si stock < requerido".
- **Implementado (difiere en el momento del descuento físico):**
  - Al entrar a `IN_REPAIR`, el Stock Guard **reserva** atómicamente todas las líneas de repuestos del presupuesto aprobado: `available → reserved`, más una fila de kardex `RESERVE`. Si alguna línea no tiene stock disponible, la transición falla con `422 INSUFFICIENT_STOCK` y se revierte todo (estado, reservas y auditoría).
  - El **descuento físico** (`physical` y `reserved` bajan, kardex `OUT`) ocurre al entrar a `QUALITY_CONTROL`, cuando el repuesto ya está instalado.
- **Motivo:** si la reparación se interrumpe, la pieza sigue en el almacén y el inventario físico no queda falseado. El bloqueo por falta de stock ocurre igual en el momento pedido.
- **Implementación:** `hooks/inventory-stock-guard.hook.ts`, `spare-part-stock.repository.ts`, CHECK `spare_parts_stock_non_negative`. Test e2e de dos OTs compitiendo por la última unidad.
- **Pregunta al cliente:** ¿el descuento físico al entrar a reparación es un requisito contable, o basta con la reserva? Si se exige, el cambio es mover `consume` al hook de `IN_REPAIR`.

### SUP-03
**Inmutabilidad de la auditoría por triggers**

- **Supuesto:** el historial de estados de una OT nunca se corrige ni se borra, ni siquiera un `ADMIN`. Una corrección se registra como una nueva transición.
- **Nota de nombres:** la tabla se llama `work_order_status_audits`, no `audit_log`. Además de esa tabla, también son append-only `unlock_code_access_logs` (revelados del código) y `stock_movements` (kardex).
- **Implementación:** `prisma/sql/immutable-audit.sql`, anexado a la migración `init_phone_repair`. La función `reject_mutation()` se aplica con triggers `BEFORE UPDATE OR DELETE`. Test e2e que intenta `UPDATE` y `DELETE` y verifica el rechazo.
- **Riesgo:** bajo. Un superusuario de PostgreSQL puede desactivar los triggers; queda fuera del alcance de la aplicación.

### SUP-04
**Expiración de presupuestos técnicos**

- **Supuesto:** un presupuesto enviado vence a los `BUDGET_VALIDITY_DAYS` (7 por defecto) desde su envío, porque los precios de pantallas y módulos varían con el tipo de cambio. Vencido, no se puede aprobar: se marca `EXPIRED` y se emite una nueva versión. Las versiones anteriores quedan `SUPERSEDED`.
- **Implementación:** `BudgetsService.requireDecidable`, campo `budgets.expires_at`, índice `(status, expires_at)`.
- **Pendiente técnico:** hoy un presupuesto se marca `EXPIRED` cuando alguien intenta aprobarlo; no hay un job que lo haga solo. La UI debe calcular "vencido" a partir de `expiresAt`.
- **Pregunta al cliente:** ¿7 días es correcto? ¿Debe avisarse al cliente antes del vencimiento?

### SUP-05
**Portal del cliente: dos modos de acceso** — *Confirmado el 2026-10-19*

- **Decisión:** se permiten **ambos** modos.
  1. **Con cuenta:** usuario de rol `CUSTOMER` → `GET /work-orders/mine` (todas sus OTs).
  2. **Sin cuenta:** número de OT + **código de seguimiento** → `POST /public/tracking` (una OT).
- **El código de seguimiento:**
  - Se genera al recibir el equipo (`POST /work-orders`): 8 caracteres de un alfabeto de 31 símbolos sin caracteres confundibles (sin `0/O`, `1/I/L`), unas 8,5·10¹¹ combinaciones. Se imprime en el ticket como `ABCD-EFGH`.
  - Se devuelve **una sola vez**, en la respuesta del alta (`trackingCode`). En la base solo se guarda su hash argon2 (`work_orders.tracking_code_hash`).
  - **Nunca es el PIN de desbloqueo del celular.** Se genera al azar y se regenera si coincidiera con el código de desbloqueo (RN-03).
  - Ticket perdido: `POST /work-orders/:id/tracking-code/regenerate` (Recepción, Admin) emite uno nuevo e invalida el anterior.
- **Protecciones del endpoint público:** `@Public()`, rate limit de 5 intentos/min por IP (`429`), el mismo `404` para "OT inexistente" y "código incorrecto", y verificación contra un hash ficticio cuando la OT no existe, para no revelar por tiempo de respuesta qué números existen.
- **Respuesta:** exactamente `CustomerWorkOrderStatusDto`, el mismo mapeo que el modo con cuenta (RN-14).
- **Implementación:** `src/domain/work-orders/tracking-code.ts`, `PublicTrackingController`, `WorkOrdersService.trackPublicly` / `regenerateTrackingCode`, migración `20261019120000_add_work_order_tracking_code`. Tests: `unit-tests/tracking-code.spec.ts`, `work-orders.service.spec.ts` y el bloque SUP-05 del e2e.
- **Limitación:** las OTs creadas antes de la migración no tienen código; para habilitarlas, Recepción usa "regenerar".

### SUP-06
**Un IMEI por dispositivo**

- **Supuesto:** en equipos dual-SIM se registra solo el IMEI 1. Si un IMEI ya existe con otro modelo, se rechaza (`409`). Si existe con otro dueño (reventa), el dispositivo pasa al nuevo cliente y conserva su historial (RN-13).
- **Pregunta al cliente:** ¿se necesita registrar el segundo IMEI para la trazabilidad?

### SUP-07
**Almacenamiento del refresh token en el frontend**

- **Supuesto:** el backend devuelve el refresh token en el cuerpo de la respuesta (heredado del taller). El frontend lo guarda en `sessionStorage` (se pierde al cerrar la pestaña) y nunca en `localStorage` (FE-16).
- **Mejora propuesta:** emitirlo como cookie `httpOnly; Secure; SameSite=Strict` en `/auth/refresh`.

### SUP-08
**Sin cancelación después de la aprobación**

- **Supuesto:** la máquina de estados no permite `APPROVED → CANCELLED` ni `IN_REPAIR → CANCELLED`. Por eso no existe la liberación de reservas (kardex `RELEASE`, definido pero sin uso).
- **Pregunta al cliente:** ¿qué pasa si el cliente se arrepiente después de aprobar, o el equipo resulta irreparable durante la reparación? Si se habilita, se agrega una transición y un hook que libere las reservas.

### SUP-09
**Cifrado reversible del código de desbloqueo**

- **Supuesto:** el técnico necesita el código real para probar el equipo, así que se cifra con AES-256-GCM en lugar de hashearlo. Solo lo revelan el técnico asignado o un `ADMIN`, y cada revelado se registra antes de devolver el valor.
- **Pendiente:** política de borrado del código al entregar el equipo (p. ej. anular `unlock_code_cipher` en `DELIVERED`). Requiere decisión.

### SUP-10
**Moneda única**

- **Supuesto:** todos los importes en BOB, como en el taller (`budgets.currency` con default `BOB`). No hay conversión de moneda.

---

## Trazabilidad: módulos, reglas y supuestos

| Módulo | Reglas de negocio | Supuestos | Épica |
| --- | --- | --- | --- |
| `auth`, `users` | RN-06, RN-07, RN-14 | SUP-07 | [E1](backlog/E1-recepcion-asignacion-y-ciclo-de-la-orden.md) |
| `work-orders` (+ `work-order-transitions`) | RN-01, RN-03, RN-04, RN-05, RN-06, RN-12, RN-14 | SUP-03, SUP-05, SUP-08, SUP-09 | [E1](backlog/E1-recepcion-asignacion-y-ciclo-de-la-orden.md), [E4](backlog/E4-seguimiento-y-comunicacion-con-el-cliente.md) |
| `devices` | RN-02, RN-13 | SUP-01, SUP-06 | [E1](backlog/E1-recepcion-asignacion-y-ciclo-de-la-orden.md) |
| `budgets` | RN-05, RN-07, RN-08, RN-10, RN-15 | SUP-04, SUP-10 | [E2](backlog/E2-presupuestos-y-aprobacion-del-cliente.md) |
| `spare-parts` | RN-07, RN-09, RN-10, RN-11, RN-15 | SUP-02, SUP-08 | [E3](backlog/E3-inventario-de-repuestos.md) |

## Fuera del MVP

Módulos del proyecto base (`pdis/taller_back`) que no se portaron. Reintroducir cualquiera exige un `SUP-xx` nuevo y su pregunta al cliente.

| Módulo del taller | Motivo | Pregunta |
| --- | --- | --- |
| `work-bays` | El servicio técnico no trabaja con bahías físicas | — |
| `warranties` | Garantía no relevada | [P-14](preguntas-cliente.md#p-14) |
| `settlements` | Liquidación y cobro no relevados; el sistema solo calcula el presupuesto | [P-12](preguntas-cliente.md#p-12), [P-21](preguntas-cliente.md#p-21) |
| `additional-findings` | Una falla nueva se resuelve con otra versión de presupuesto | [P-13](preguntas-cliente.md#p-13) |
| `inventory-discrepancies` | Se cubre con ajustes de stock con motivo (US-14) | [P-23](preguntas-cliente.md#p-23) |
