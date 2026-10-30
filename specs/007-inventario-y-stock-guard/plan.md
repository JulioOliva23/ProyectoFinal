# Plan 007 · Inventario de repuestos y Stock Guard

Cumple la [constitución](../../docs/constitution.md) (C5.1 PostgreSQL como fuente de verdad, C5.4 kardex *append-only*, C3.3 capas). Cubre RF-1 a RF-7 de [spec.md](spec.md).

## 1. Estructura de módulos

| Archivo (`servicio_back/src/modules`) | Responsabilidad | RF |
| --- | --- | --- |
| `spare-parts/spare-parts.controller.ts` | Rutas y roles; `alerts/low-stock` antes de `:id` | RF-1, RF-2, RF-3, RF-6 |
| `spare-parts/spare-parts.service.ts` | Reglas del catálogo, entradas, ajustes y precios para presupuestos; oculta costo y precio según rol | RF-1 a RF-3 |
| `spare-parts/dto/spare-part.dto.ts` | SKU, categorías, importes, mínimos, compatibilidad, cantidades | RF-1.1, RF-3 |
| `spare-parts/repositories/spare-part.repository.ts` | Catálogo, compatibilidad, kardex, `increase`/`decrease` condicionados | RF-1 a RF-4, RF-7 |
| `spare-parts/repositories/spare-part-stock.repository.ts` | `reserve` y `consume` solo dentro de la transacción del llamador | RF-4, RF-5 |
| `work-orders/hooks/inventory-stock-guard.hook.ts` | Engancha reserva/consumo a las transiciones de la orden | RF-5 |
| `prisma/sql/immutable-audit.sql` | CHECK `spare_parts_stock_non_negative` y triggers del kardex | RF-4.1, RF-7.2 |

## 2. Modelo de datos

```json
{
  "SparePart": {
    "id": "…", "sku": "OLED-IP13", "name": "Pantalla OLED iPhone 13", "category": "DISPLAY_OLED",
    "unitCost": "620.00", "workshopPrice": "980.00",
    "physicalStock": 5, "reservedStock": 2, "availableStock": 3, "minStock": 2,
    "isActive": true, "lastMovementAt": "2026-10-20T15:31:08.000Z"
  },
  "SparePartCompatibility": { "sparePartId": "…", "deviceModelId": "…" },
  "StockMovement": {
    "id": "…", "sparePartId": "…", "workOrderId": "…", "userId": "…",
    "type": "RESERVE", "quantity": 1, "reason": null, "createdAt": "2026-10-20T15:31:08.000Z"
  }
}
```

Tipos de movimiento: `IN`, `RESERVE`, `RELEASE` (definido, sin uso: SUP-08), `OUT`, `ADJUSTMENT`. Respuesta de lectura por rol: `unitCost` solo a Admin; `workshopPrice` a Admin y Recepción; el técnico recibe solo existencias.

## 3. Algoritmos

```text
Invariante (CHECK en BD):  availableStock = physicalStock − reservedStock  ∧  availableStock ≥ 0

reserve(line, workOrderId, userId):                                     # RF-5.1
  n = UPDATE spare_parts
        SET available = available − q, reserved = reserved + q
        WHERE id = line.sparePartId AND isActive AND available >= q    # guarda condicional
  if n != 1: return false                                                # sin stock suficiente
  budgetItem.reservationStatus = RESERVED ; insert StockMovement(RESERVE)
  return true

consume(line, workOrderId, userId):                                     # RF-5.3
  n = UPDATE spare_parts
        SET reserved = reserved − q, physical = physical − q
        WHERE id AND reserved >= q AND physical >= q
  if n != 1: return false
  budgetItem.reservationStatus = CONSUMED ; insert StockMovement(OUT)

stockGuard(IN_REPAIR):                                                  # RF-5.1, RF-5.2, RF-5.4
  lines = approved PART lines with status PENDING, ORDER BY sparePartId   # mismo orden = sin deadlock
  missing = [l.sparePartId for l in lines if !reserve(l)]
  if missing: throw 422 {code: INSUFFICIENT_STOCK, sparePartIds: missing} # rollback de las reservas previas

adjust(id, delta, reason, userId):                                      # RF-3.2, RF-3.3
  tx: if delta > 0: increase(id, delta)
      else if !decrease(id, −delta):   # UPDATE ... WHERE available >= −delta
            throw 422 "RN-11: el ajuste excede el stock disponible"
      insert StockMovement(ADJUSTMENT, delta, reason)

lowStock(part): part.availableStock <= part.minStock                    # RF-6.1
```

## 4. Contrato de uso (`/api/v1`)

| Operación | Ruta | Roles | Notas |
| --- | --- | --- | --- |
| Listar | `GET /spare-parts?category=&deviceModelId=&search=&page=&pageSize=` | Staff | costo solo Admin; precio no a Técnico |
| Alertas | `GET /spare-parts/alerts/low-stock` | Admin, Recepción | disponible ≤ mínimo |
| Detalle | `GET /spare-parts/:id` | Staff | 404 |
| Alta / edición / baja | `POST` · `PATCH :id` · `DELETE :id` | Admin | 422 modelos inexistentes o reservas |
| Entrada | `POST /spare-parts/:id/stock-entries` `{quantity, reason?}` | Admin, Recepción | kardex `IN` |
| Ajuste | `POST /spare-parts/:id/adjustments` `{delta, reason}` | Admin | 422 si excede lo disponible |

La reserva y el consumo no tienen ruta propia: los dispara la transición de la orden (spec 004).

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| `UPDATE` condicionado (`WHERE available >= q`) | Atómico en la base: dos transacciones no pueden gastar la misma unidad (RNF-1) | Leer, comprobar en código y escribir: carrera |
| CHECK en la base además de la guarda | Última defensa si un cambio futuro olvida la guarda | Confiar solo en el código |
| Reservar al iniciar reparación, consumir en control de calidad | Si se interrumpe, la pieza sigue en almacén (SUP-02) | Descontar al iniciar |
| Kardex en la misma transacción que el movimiento | Cada unidad es rastreable (RNF-2) | Registrar después: movimientos sin rastro |
| Orden fijo por `sparePartId` | Evita bloqueos cruzados entre órdenes con varios repuestos | Orden de aparición en el presupuesto |
| Baja lógica con control de reservas | Conserva compatibilidad e historial; no deja órdenes sin su pieza | `DELETE`: rompe presupuestos y kardex |
| Salida de DTO según rol | El costo nunca viaja a quien no debe verlo (RN-07) | Ocultarlo solo en la interfaz |

## 6. Estrategia de tests

| Nivel | Tests | RF |
| --- | --- | --- |
| Unitario `spare-parts.service.spec.ts` | costo solo Admin y precios ocultos al técnico · alerta de stock bajo · precios compatibles · repuesto incompatible · inexistente/inactivo · ajuste mayor al disponible · kardex por entrada · no se da de baja con reservas | RF-1.5, RF-2, RF-3, RF-6 |
| Unitario `inventory-stock-guard.hook.spec.ts` | solo intercepta IN_REPAIR/QC · reserva todo · bloquea listando faltantes · retrabajo sin efecto · consume reservados | RF-5 |
| e2e | "lets only one of two orders reserve the last unit (RN-09)" · "consumes the reservation when entering quality control" · "shows the part as a low-stock alert (RN-11)" · "forbids a technician from creating spare parts" · "hides prices from technicians (RN-07)" | RF-2, RF-5, RF-6 |
| Unitario `dto-limits` | SKU en minúsculas, corto o con símbolos; mínimo fuera de rango; más de 200 modelos | RF-1.1 |
| Unitario `spec-rules` | modelos compatibles inexistentes → 422 | RF-1.6 |
| e2e `spec-coverage` | `UPDATE`/`DELETE` sobre `stock_movements` rechazados; CHECK de existencias ante una escritura directa (RF-4.1) | RF-7.2, RF-4.1 |
