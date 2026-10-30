# Plan 004 · Ciclo de vida de la orden de trabajo

Cumple la [constitución](../../docs/constitution.md) (C3.1 dominio puro, C3.3 fuente única del estado, C5.4 auditoría inalterable). Cubre RF-1 a RF-10 de [spec.md](spec.md).

## 1. Estructura de módulos

| Archivo (`servicio_back/src`) | Responsabilidad | RF |
| --- | --- | --- |
| `domain/work-orders/work-order-state-machine.ts` | **Tabla única** de transiciones y roles; funciones puras `checkTransition`, `allowedTransitionsFor` | RF-1 |
| `domain/work-orders/work-order-status-labels.ts` | Etiqueta en español de cada estado | RF-1.1 |
| `modules/work-orders/services/work-order-transition.service.ts` | **Único** punto que cambia `status`: valida, hace compare-and-set y corre los hooks | RF-1, RF-3, RF-8 |
| `modules/work-orders/hooks/workflow-preconditions.hook.ts` | Técnico asignado / presupuesto enviado / aprobado | RF-4 |
| `modules/work-orders/hooks/inventory-stock-guard.hook.ts` | Reserva y consumo de repuestos | RF-6, RF-8.2 |
| `modules/work-orders/hooks/audit-trail.hook.ts` | Inserta la fila de historial (último hook) | RF-7 |
| `modules/work-orders/work-orders.service.ts` | Asignación, diagnóstico, revelado, historial, visibilidad por rol | RF-2, RF-3, RF-5, RF-9 |
| `prisma/sql/immutable-audit.sql` | Triggers que rechazan `UPDATE`/`DELETE` | RF-7.3, RF-9.4 |

## 2. Modelo de datos

```json
{
  "WorkOrderStatusAudit": {
    "id": "…", "workOrderId": "…", "userId": "…",
    "previousStatus": "APPROVED", "newStatus": "IN_REPAIR",
    "reason": null, "createdAt": "2026-10-20T15:31:08.000Z"
  },
  "UnlockCodeAccessLog": { "id": "…", "workOrderId": "…", "userId": "…", "createdAt": "2026-10-20T15:40:00.000Z" },
  "WorkOrder": { "id": "…", "number": 123, "status": "IN_REPAIR", "technicianId": "…", "unlockCodeCipher": "…", "lockType": "PIN" }
}
```

Las dos tablas de bitácora son *append-only* por trigger (`reject_mutation()` en `BEFORE UPDATE OR DELETE`).

## 3. Algoritmos

```text
transition(request):                                           # una sola transacción
  order = repo.findForTransition(tx, request.workOrderId)      # 404
  if request.role == TECHNICIAN and order.technicianId != request.userId: 403   # RF-3.2
  check = checkTransition(order.status, request.to, request.role)
  if check == ILLEGAL: 409                                     # RF-1.3, RF-1.5
  if check == ROLE_NOT_ALLOWED: 403                            # RF-1.4
  ok = repo.compareAndSet(tx, order.id, from=order.status, to=request.to)   # toma el bloqueo de fila
  if !ok: 409 "cambió concurrentemente"                        # RF-8.1
  for hook in [preconditions, stockGuard, auditTrail]:         # orden fijo; audit al final
      if hook.supports(ctx): hook.handle(ctx, tx)              # cualquier throw → rollback total

preconditions(ctx):                                            # RF-4
  IN_DIAGNOSIS → exige técnico asignado
  BUDGETED     → exige un presupuesto en estado SENT
  APPROVED     → exige un presupuesto en estado APPROVED       # lo actualiza antes el módulo de presupuestos

stockGuard(ctx):                                               # RF-6
  IN_REPAIR:  lines = approvedPartLines(PENDING) ordenadas por sparePartId
              missing = []
              for line in lines: if !reserve(line): missing.add(line.sparePartId)
              if missing: throw 422 {code: INSUFFICIENT_STOCK, sparePartIds: missing}   # rollback
  QUALITY_CONTROL: for line in approvedPartLines(RESERVED): if !consume(line): throw 422 RESERVATION_MISMATCH

revealUnlockCode(id, user):                                    # RF-9
  order = requireVisible(id, user)                             # técnico ajeno → 403
  if user.role != ADMIN and order.technicianId != user.id: 403
  if !order.unlockCodeCipher: 404
  tx: insert UnlockCodeAccessLog(id, user.id); read cipher
  return {lockType, unlockCode: cipher.decrypt(stored)}        # la bitácora se escribe antes de devolver

assignTechnician(id, techId):                                  # RF-2
  assertActiveTechnician(techId)                               # 422
  updated = UPDATE ... WHERE id AND status IN (RECEIVED, IN_DIAGNOSIS, BUDGETED, APPROVED)
  if !updated: 409
```

## 4. Contrato de uso (`/api/v1`)

| Operación | Ruta | Roles | Errores principales |
| --- | --- | --- | --- |
| Transición | `POST /work-orders/:id/transitions` `{to, reason?}` | Staff | 403 rol/técnico ajeno · 409 ilegal o concurrente · 422 precondición o `INSUFFICIENT_STOCK` |
| Asignar técnico | `POST /work-orders/:id/assign-technician` `{technicianId}` | Admin, Recepción | 409 · 422 |
| Diagnóstico | `PATCH /work-orders/:id/diagnosis` `{preliminaryDiagnosis}` | Admin, Técnico | 403 · 409 |
| Revelar código | `POST /work-orders/:id/unlock-code/reveal` | Admin, Técnico | 403 · 404 |
| Historial | `GET /work-orders/:id/audit` | Staff | 403 · 404 |

Respuesta de una orden: incluye `allowedTransitions` (RF-1.7) y `hasUnlockCode`, nunca el código ni su cifrado.

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| Tabla de transiciones única en `domain/` | Una sola fuente para backend, UI y tests; función pura | Reglas `if` repartidas por los services: se desincronizan |
| *Compare-and-set* antes de los hooks | Toma el bloqueo de fila: la transición concurrente falla **antes** de tocar el stock | Leer y luego escribir: carrera entre dos usuarios |
| Cadena de hooks en la misma transacción | Rollback total si falla stock o historial (RNF-1) | Eventos asíncronos: estados parciales posibles |
| Reservar en `IN_REPAIR` y descontar en `QUALITY_CONTROL` | Si la reparación se interrumpe, la pieza sigue en almacén (SUP-02) | Descontar al iniciar: inventario físico falseado |
| Reservas ordenadas por `sparePartId` | Dos transacciones bloquean filas en el mismo orden: sin *deadlock* (RNF-4) | Orden arbitrario: bloqueos cruzados |
| Triggers de BD para el historial | Inmutable aunque falle o cambie el código de la aplicación (C5.4) | Solo convención en el código: un `UPDATE` accidental lo rompe |
| `UnlockCodeAccessLog` en la misma transacción que la lectura | No se puede leer el código sin dejar rastro | Registrar después: ventana sin auditoría |

## 6. Estrategia de tests

| Nivel | Tests | RF |
| --- | --- | --- |
| Unitario `work-order-state-machine.spec.ts` | salto de aprobación · técnico aprobando · cliente · retrabajo QC · transiciones por rol · Entregado terminal | RF-1 |
| Unitario `work-order-transition.service.spec.ts` | aplica y audita · propaga fallo de stock · técnico ajeno · ilegal 409 · carrera perdida · 404 | RF-1, RF-3, RF-7, RF-8.1 |
| Unitario `workflow-preconditions.hook.spec.ts` | exige técnico · exige presupuesto SENT · bloquea APPROVED sin aprobación · ignora el resto | RF-4 |
| Unitario `inventory-stock-guard.hook.spec.ts` | solo intercepta IN_REPAIR/QC · reserva todo · bloquea listando faltantes · retrabajo sin efecto · consume | RF-6 |
| Unitario `work-orders.service.spec.ts` | técnico no lee ajenas · revela al asignado · no revela a recepción · allowedTransitions por rol | RF-1.7, RF-3, RF-9 |
| e2e `phone-repair-flow` | diagnóstico exige técnico · APPROVED exige presupuesto · una sola orden toma la última unidad · consumo en QC · técnico no asignado rechazado · flujo hasta DELIVERED con una fila de historial por transición · `UPDATE`/`DELETE` rechazados · DELIVERED terminal · revelado solo al asignado con bitácora | RF-1 a RF-9 |
| Unitario `spec-rules` | reasignar tras iniciar la reparación → 409 | RF-2.3 |
| e2e `spec-coverage` | `UPDATE`/`DELETE` sobre `unlock_code_access_logs` rechazados por el trigger | RF-9.4 |
| Unitario `dto-limits` | motivo de 2 y 501 caracteres rechazado; 3 a 500 aceptado | RF-10 |
