# Plan 006 · Presupuestos y aprobación del cliente

Cumple la [constitución](../../docs/constitution.md) (C3.3 el estado de la orden solo cambia vía `WorkOrderTransitionService`, C5.3 `Decimal`). Cubre RF-1 a RF-8 de [spec.md](spec.md).

## 1. Estructura de módulos

| Archivo (`servicio_back/src/modules/budgets`) | Responsabilidad | RF |
| --- | --- | --- |
| `budgets.controller.ts` | Rutas y `@Roles(Admin, Recepción)` en todas | RF-8.1 |
| `budgets.service.ts` | Armado, envío, aprobación, rechazo, vencimiento; llama a `transitionWithin` | RF-1 a RF-7 |
| `dto/budget.dto.ts` · `dto/budget-enums.ts` | Líneas, canales, motivos; estados del presupuesto | RF-1.2, RF-5, RF-6 |
| `repositories/budget.repository.ts` | Único acceso a `Budget` y `BudgetItem`; cambio de estado condicionado | todos |
| `spare-parts/spare-parts.service.ts` → `priceCompatibleParts` | Precios del catálogo y compatibilidad | RF-1.3, RF-2 |
| `work-orders/services/work-order-transition.service.ts` → `transitionWithin` | Cambia la orden dentro de la misma transacción | RF-4.2, RF-5.1, RF-6.1 |
| `modules/config/app-config.service.ts` | `BUDGET_VALIDITY_DAYS` | RF-4.1 |

## 2. Modelo de datos

```json
{
  "Budget": {
    "id": "…", "workOrderId": "…", "version": 2, "status": "SENT",
    "laborSubtotal": "150.00", "partsSubtotal": "980.00", "total": "1130.00", "currency": "BOB",
    "sentAt": "2026-10-20T15:00:00.000Z", "expiresAt": "2026-10-27T15:00:00.000Z",
    "decidedAt": null, "decidedBy": null, "decisionChannel": null, "rejectionReason": null,
    "createdBy": "…"
  },
  "BudgetItem": [
    { "itemType": "LABOR", "description": "Micro-soldadura de flex de carga", "quantity": 1, "unitPrice": "150.00", "subtotal": "150.00", "sparePartId": null },
    { "itemType": "PART", "description": "Pantalla OLED iPhone 13", "quantity": 1, "unitPrice": "980.00", "subtotal": "980.00",
      "sparePartId": "…", "reservationStatus": "PENDING" }
  ]
}
```

Estados del presupuesto: `DRAFT → SENT → APPROVED | REJECTED | EXPIRED`, y `SUPERSEDED` al enviarse una versión posterior. Canales: `IN_PERSON`, `PHONE`, `WHATSAPP`, `EMAIL`. Estado de reserva por línea de repuesto: `PENDING → RESERVED → CONSUMED` (spec 007).

## 3. Algoritmos

```text
create(workOrderId, dto, user):                                    # RF-1
  order = findWorkOrderContext(workOrderId)                         # 404
  if order.status not in [IN_DIAGNOSIS, BUDGETED]: throw 409        # RF-1.5
  prices = priceCompatibleParts(partIds, order.deviceModelId)       # RF-2: 422 si incompatible/inexistente
  for item in dto.items:
      unitPrice = item.PART ? prices[item.sparePartId].workshopPrice   # RF-1.3: nunca del cliente
                            : Decimal(item.unitPrice)
      subtotal  = unitPrice * item.quantity
  laborSubtotal = sum(subtotal where LABOR) ; partsSubtotal = sum(subtotal where PART)   # Decimal exacto
  total = laborSubtotal + partsSubtotal
  repo.create({..., status: DRAFT, expiresAt: now + validityDays /* provisional */})

send(id, user):                                                     # RF-4, RF-3.1
  tx:
    changeStatus(id, from=DRAFT, to=SENT, sentAt=now, expiresAt=now + validityDays) or throw 409
    supersedeOthers(workOrderId, except=id)
    if order.status == IN_DIAGNOSIS: transitionWithin(tx, → BUDGETED)

requireDecidable(id):                                               # RF-7
  b = require(id)
  if b.status != SENT: throw 409
  if b.expiresAt < now: markExpired(id); throw 422 "emitir nueva versión"

approve(id, channel, user):                                         # RF-5
  b = requireDecidable(id)
  tx:
    changeStatus(id, from=SENT, to=APPROVED, channel, decidedAt, decidedBy) or throw 409
    transitionWithin(tx, → APPROVED)        # el hook exige presupuesto APPROVED: ya actualizado

reject(id, channel, reason, user):                                  # RF-6
  b = requireDecidable(id)
  tx:
    changeStatus(id, from=SENT, to=REJECTED, ..., rejectionReason=reason) or throw 409
    transitionWithin(tx, → CANCELLED, reason="Budget rejected: "+reason)
```

`changeStatus` es un `UPDATE … WHERE id AND status = from`: si dos personas deciden a la vez, solo una afecta una fila.

## 4. Contrato de uso (`/api/v1`)

| Operación | Ruta | Roles | Entrada → salida |
| --- | --- | --- | --- |
| Armar | `POST /work-orders/:workOrderId/budgets` | Admin, Recepción | `{items:[{itemType, description, sparePartId?, quantity, unitPrice?}]}` → presupuesto · 409 · 422 |
| Listar versiones | `GET /work-orders/:workOrderId/budgets?version=` | Admin, Recepción | → presupuestos |
| Detalle | `GET /budgets/:id` | Admin, Recepción | → presupuesto · 404 |
| Enviar | `POST /budgets/:id/send` | Admin, Recepción | → presupuesto · 409 |
| Aprobar | `POST /budgets/:id/approve` `{channel}` | Admin, Recepción | → presupuesto · 409 · 422 vencido |
| Rechazar | `POST /budgets/:id/reject` `{channel, reason}` | Admin, Recepción | → presupuesto · 409 · 422 vencido |

Importes como cadenas con dos decimales (`"1130.00"`).

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| `Prisma.Decimal` y `Decimal(12,2)` | Sin errores de coma flotante (RNF-1, C5.3) | `number`/`Float`: 0.1 + 0.2 ≠ 0.3 |
| Precio de repuestos tomado del catálogo | Recepción no puede inflar ni rebajar un repuesto por error o abuso | Aceptar el precio del cliente HTTP |
| Decisión + cambio de estado en una transacción con `transitionWithin` | Imposible quedar con presupuesto aprobado y orden sin aprobar (RNF-2) | Dos llamadas: estados incoherentes si falla la segunda |
| Versionar y marcar `SUPERSEDED` en vez de editar | Conserva lo que se ofreció (RNF-3) | `UPDATE` del mismo registro: se pierde el historial |
| Vencer "perezosamente" al decidir | Cero infraestructura nueva (C1.1) | Tarea programada: ver spec 010 (pendiente) |
| `changeStatus` condicionado por estado de origen | Evita decisiones dobles sin bloqueos explícitos | Leer y luego escribir: carrera |

## 6. Estrategia de tests

| Nivel | Tests | RF |
| --- | --- | --- |
| Unitario `budgets.service.spec.ts` | aritmética decimal con precios del catálogo · no se arma tras aprobar · enviar mueve la orden a Presupuestado · aprobar es atómico · aprobar vencido falla y marca EXPIRED · rechazar cancela con motivo · solo SENT se decide | RF-1, RF-4 a RF-7 |
| Unitario `spare-parts.service.spec.ts` | "prices compatible parts…" · "rejects a part that does not fit…" · "rejects unknown or inactive parts" | RF-2 |
| e2e | "rejects approval of an expired budget" · "does not let technicians read budgets (RN-07)" · flujo completo con presupuesto aprobado | RF-5, RF-7, RF-8.1 |
| Pendiente | Versiones: la anterior queda `SUPERSEDED` | RF-3.1 |
| Pendiente | Rechazo cancela la orden (e2e) | RF-6.1 |
| Pendiente | Validación de límites (0 y 51 líneas, cantidad 0 y 51) | RF-1.1, RF-1.2 |
| Pendiente | Respuesta sin costo unitario | RF-8.2 |
