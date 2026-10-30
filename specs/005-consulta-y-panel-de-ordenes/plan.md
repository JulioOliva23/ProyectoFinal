# Plan 005 · Consulta de órdenes y panel de control

Cumple la [constitución](../../docs/constitution.md) (C3.1 dominio puro para el parseo de búsqueda, C7.2 DTO con longitud máxima). Cubre RF-1 a RF-5 de [spec.md](spec.md).

## 1. Estructura de módulos

| Archivo (`servicio_back/src`) | Responsabilidad | RF |
| --- | --- | --- |
| `domain/work-orders/work-order-queries.ts` | Funciones puras: estados activos/atrasados y `parseWorkOrderSearch` | RF-2, RF-4 |
| `domain/work-orders/tracking-code.ts` | `parseWorkOrderNumber` ("OT-000123" → 123) reutilizado por la búsqueda | RF-2.2 |
| `modules/work-orders/dto/work-order-actions.dto.ts` | `QueryWorkOrdersDto`: estado, técnico, `search` (≤100), paginación | RF-1, RF-2.5 |
| `modules/work-orders/work-orders.service.ts` → `list`, `summary`, `get` | Alcance del técnico, armado del resumen | RF-1, RF-3, RF-4, RF-5 |
| `modules/work-orders/repositories/work-order.repository.ts` | `list`, `countByStatus`, `countOverdue` | RF-1, RF-2, RF-4 |
| `modules/work-orders/work-orders.controller.ts` | Rutas; `summary` declarada antes de `:id` | RF-4 |

## 2. Modelo de datos

Sin tablas nuevas. Respuesta del resumen:

```json
{
  "active": 14,
  "overdue": 3,
  "byStatus": [
    { "status": "RECEIVED", "count": 2 },
    { "status": "IN_DIAGNOSIS", "count": 4 },
    { "status": "BUDGETED", "count": 1 },
    { "status": "APPROVED", "count": 2 },
    { "status": "IN_REPAIR", "count": 4 },
    { "status": "QUALITY_CONTROL", "count": 1 },
    { "status": "READY_FOR_DELIVERY", "count": 0 },
    { "status": "DELIVERED", "count": 31 },
    { "status": "CANCELLED", "count": 5 }
  ]
}
```

Página del listado: `{ "data": [WorkOrder…], "total": 48, "page": 1, "pageSize": 20 }`.

## 3. Algoritmos

```text
parseWorkOrderSearch(raw):                                   # RF-2
  text = raw?.trim()
  if !text: return undefined                                  # RF-2.3
  n = parseWorkOrderNumber(text)                              # "OT-000123" | "123" → 123
  if isInteger(n) and 1 <= n <= 2_147_483_647: return {text, number: n}
  return {text}                                               # RF-2.4

list(query, user):                                            # RF-1, RF-3
  technicianId = user.role == TECHNICIAN ? user.id : query.technicianId
  where = { status?, technicianId?,
            OR: [ imei ILIKE %text%, customer.name ILIKE %text%, customer.phone ILIKE %text%,
                  number = search.number (si existe) ] }
  rows, total = findMany(where, orderBy createdAt DESC, skip, take) , count(where)

summary(now):                                                 # RF-4
  groups  = countByStatus()
  overdue = count(status IN OVERDUE_STATUSES AND promisedAt < now)
  byStatus = for each status in ALL_STATUSES: {status, count: groups[status] ?? 0}
  active   = sum(byStatus where status in ACTIVE_STATUSES)
  return {active, overdue, byStatus}

ACTIVE_STATUSES  = ALL − {DELIVERED, CANCELLED}
OVERDUE_STATUSES = ACTIVE_STATUSES − {READY_FOR_DELIVERY}
```

## 4. Contrato de uso (`/api/v1`)

| Operación | Ruta | Roles | Parámetros / salida |
| --- | --- | --- | --- |
| Listar | `GET /work-orders` | Admin, Recepción, Técnico | `status`, `technicianId`, `search`, `page`, `pageSize` → página |
| Resumen | `GET /work-orders/summary` | Admin, Recepción | → resumen |
| Detalle | `GET /work-orders/:id` | Admin, Recepción, Técnico | → orden · 403 técnico ajeno · 404 |

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| Parseo de la búsqueda en `domain/` | Pura y probada sin base de datos | Parsear en el repositorio: mezcla reglas con SQL |
| Una sola caja de búsqueda con `OR` | Recepción no sabe de antemano qué dato tiene el cliente | Campos separados: más clics en el mostrador |
| Resumen con conteo agrupado en la BD | Una consulta liviana en vez de traer órdenes | Contar en memoria: carga innecesaria |
| Listar los nueve estados incluso con cero | El cliente HTTP no adivina estados ausentes | Omitir ceros: la UI tendría que conocer el catálogo |
| El técnico fuerza su propio `technicianId` en el servicio | No depende de que la UI oculte el filtro (RN-06) | Confiar en el parámetro de la consulta |

## 6. Estrategia de tests

| Nivel | Tests | RF |
| --- | --- | --- |
| Unitario `work-order-queries.spec.ts` | texto vacío · texto sin número · número fuera de rango · estados activos · "lista para entrega" no se atrasa | RF-2, RF-4.1, RF-4.2 |
| Unitario `work-orders.service.spec.ts` | técnico limitado a su cola · alcance al buscar · filtros de recepción · conteo de activas · todos los estados con ceros · consulta de atrasadas | RF-1, RF-3, RF-4 |
| e2e | Ciclo completo consulta la orden por rol | RF-5 |
| Pendiente | Resumen prohibido a técnico y cliente | RF-4.4 |
| Pendiente | Página fuera de rango | RF-1.1 |
| Pendiente | Detalle sin código ni cifrado | RF-5.1 |
