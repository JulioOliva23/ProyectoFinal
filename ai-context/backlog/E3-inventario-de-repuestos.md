# E3 — Inventario de repuestos

## Objetivo

Mantener un catálogo de repuestos electrónicos con su compatibilidad por modelo comercial y un stock confiable: reservar los repuestos al iniciar la reparación, descontarlos cuando quedan instalados, bloquear la reparación si no alcanza el stock y avisar cuando un repuesto llega a su mínimo. Cada movimiento queda en un kardex inmutable.

## Origen

Dificultad D5 de [00-contexto-problema.md](../00-contexto-problema.md) y reglas RN-07, RN-09, RN-10, RN-11 y RN-15.

## Historias de usuario

| ID | Título | Prioridad | Puntos | Rol | Depende de | Front |
| --- | --- | --- | --- | --- | --- | --- |
| US-13 | Gestionar el catálogo de repuestos y su compatibilidad | Must | 5 | Administrador | US-00 | US-F11 |
| US-14 | Registrar ingresos y ajustes de stock | Must | 3 | Recepcionista (ingresos), Administrador | US-13 | US-F12 |
| US-15 | Reservar y consumir repuestos con Stock Guard | Must | 5 | Técnico, Administrador | US-11, US-13 | US-F07 |
| US-16 | Ver alertas de stock bajo | Should | 2 | Recepcionista, Administrador | US-13 | US-F13 |

## Trazabilidad

- **Reglas de negocio:** RN-07, RN-09, RN-10, RN-11, RN-15 en [AI_CONTEXT.md §4](../../AI_CONTEXT.md#4-reglas-de-negocio-rn).
- **Supuestos:** SUP-02, SUP-08 en [supuestos.md](../supuestos.md).
- **Preguntas abiertas:** P-09, P-10, P-11, P-22, P-23, P-24 en [preguntas-cliente.md](../preguntas-cliente.md).

### Modelo de stock

| Campo | Significado |
| --- | --- |
| `physicalStock` | Unidades en el almacén |
| `reservedStock` | Unidades apartadas para OTs en reparación |
| `availableStock` | `physical − reserved`; nunca negativo (CHECK `spare_parts_stock_non_negative`) |

Movimientos de kardex (`stock_movements`, append-only): `IN` · `RESERVE` · `RELEASE` (definido, sin uso por SUP-08) · `OUT` · `ADJUSTMENT`.

## US-13: Gestionar el catálogo de repuestos y su compatibilidad

**Como** Administrador, **quiero** dar de alta, editar y desactivar repuestos electrónicos indicando con qué modelos son compatibles, **para** presupuestar correctamente.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 5 | Administrador | US-00 |

### Criterios de aceptación

```gherkin
Escenario: Alta de repuesto
  Cuando el administrador registra una pantalla OLED con costo, precio taller, stock mínimo y modelos compatibles
  Entonces el repuesto aparece en el catálogo con su compatibilidad

Escenario: Categorías
  Entonces las categorías son DISPLAY_OLED, DISPLAY_LCD, BATTERY, CHARGING_FLEX, CAMERA_MODULE, SMD_COMPONENT, IC y OTHER

Escenario: Modelo inexistente
  Cuando asocia un modelo que no existe
  Entonces el backend responde 422

Escenario: Desactivación con reservas
  Dado un repuesto con unidades reservadas para OTs
  Cuando intenta desactivarlo
  Entonces el backend responde 422 y el repuesto sigue activo

Escenario: Costo visible solo para ADMIN (RN-07)
  Dado un usuario RECEPTIONIST
  Cuando consulta el catálogo
  Entonces no recibe el costo unitario

Escenario: Filtros
  Cuando filtra por categoría, modelo compatible o texto
  Entonces el listado paginado muestra solo los repuestos que coinciden
```

### Implementación

- **Backend:** `GET/POST/PATCH/DELETE /spare-parts` en `modules/spare-parts`; borrado lógico (`isActive`); `SparePartCompatibility`; DTO de salida por rol.
- **Frontend:** `features/inventory` (`InventoryPage`, `SparePartFormModal`, `CompatibilityModal`, `DeviceModelPicker`).
- **Estado:** back ✅ · front ✅.

## US-14: Registrar ingresos y ajustes de stock

**Como** Recepcionista, **quiero** registrar la llegada de repuestos. **Como** Administrador, **quiero** ajustar mermas o diferencias con su motivo, **para** que el sistema refleje el almacén real.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 3 | Recepcionista (ingresos), Administrador | US-13 |

### Criterios de aceptación

```gherkin
Escenario: Ingreso de stock
  Cuando la recepcionista registra 10 baterías recibidas
  Entonces el stock físico y disponible suben en 10
  Y se inserta un movimiento IN con el usuario y el motivo

Escenario: Ajuste con motivo
  Cuando el administrador registra un ajuste de -2 por "pantallas dañadas"
  Entonces el stock baja en 2 y se inserta un movimiento ADJUSTMENT

Escenario: Ajuste mayor al disponible (RN-11)
  Cuando el ajuste supera el stock disponible (no reservado)
  Entonces el backend responde 422 y la interfaz muestra el error junto al campo

Escenario: Recepción no puede ajustar
  Dado un usuario RECEPTIONIST
  Cuando llama a POST /spare-parts/:id/adjustments
  Entonces recibe 403
```

### Implementación

- **Backend:** `POST /spare-parts/:id/stock-entries` (Recepción, Admin) y `POST /spare-parts/:id/adjustments` (Admin); `updateMany` condicionado + kardex en la misma transacción.
- **Frontend:** `StockMovementModal`.
- **Estado:** back ✅ · front ✅.
- **Hallazgo abierto (RN-07):** `SparePartsService.registerEntry` arma la respuesta con la vista `ADMIN`, así que una recepcionista que registra un ingreso recibe `unitCost`. Debe usar el rol del usuario autenticado.

## US-15: Reservar y consumir repuestos con Stock Guard

**Como** Técnico, **quiero** saber de inmediato si faltan repuestos al iniciar la reparación, **para** no desarmar un equipo que no puedo terminar.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 5 | Técnico, Administrador | US-11, US-13 |

### Criterios de aceptación

```gherkin
Escenario: Reserva al iniciar la reparación (RN-09, SUP-02)
  Dado una OT "Aprobado" con un presupuesto que incluye una pantalla con stock
  Cuando pulso "Iniciar reparación"
  Entonces la OT pasa a "En Reparación"
  Y la pantalla pasa de disponible a reservada con un movimiento RESERVE

Escenario: Falta de stock
  Dado una OT aprobada con una pantalla sin stock disponible
  Cuando pulso "Iniciar reparación"
  Entonces el backend responde 422 INSUFFICIENT_STOCK con los repuestos faltantes
  Y veo un banner con la pantalla faltante
  Y la OT sigue en "Aprobado" sin reservas parciales

Escenario: Consumo al pasar a control de calidad
  Dado una OT "En Reparación" con repuestos reservados
  Cuando pasa a "Control de Calidad"
  Entonces el stock físico y reservado bajan y se inserta un movimiento OUT

Escenario: Concurrencia por la última unidad
  Dado dos OTs aprobadas que necesitan la última unidad del mismo repuesto
  Cuando ambas intentan iniciar la reparación al mismo tiempo
  Entonces solo una lo logra y la otra recibe 422

Escenario: Sin precios para el técnico (RN-07)
  Entonces el panel de repuestos de la OT muestra "Pendiente", "Reservado" o "Consumido" sin precios
```

### Implementación

- **Backend:** `InventoryStockGuardHook` (`modules/work-orders/hooks/inventory-stock-guard.hook.ts`) dentro de la transacción de la transición; bloqueo ordenado por `sparePartId` para evitar deadlocks; rollback total si falta stock.
- **Frontend:** `StockGuardBanner`, `TransitionActions`.
- **Estado:** back ✅ · front ✅. Sin liberación de reservas porque no hay cancelación después de aprobar (SUP-08, P-11).

## US-16: Ver alertas de stock bajo

**Como** Recepcionista, **quiero** ver los repuestos que llegaron a su mínimo, **para** reponerlos a tiempo.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Should | 2 | Recepcionista, Administrador | US-13 |

### Criterios de aceptación

```gherkin
Escenario: Repuesto en el mínimo (RN-11)
  Dado un repuesto con stock disponible igual o menor a su stock mínimo
  Cuando abro "/inventario/alertas"
  Entonces aparece en la lista de stock bajo

Escenario: Indicador en el menú
  Dado que hay repuestos en stock bajo
  Entonces el menú muestra un badge con la cantidad, sin modales
```

### Implementación

- **Backend:** `GET /spare-parts/alerts/low-stock` (Recepción, Admin); campo `lowStock` en la respuesta.
- **Frontend:** `LowStockPage`, `StockBadge`, enlace "Stock bajo" en el menú.
- **Estado:** back ✅ · front parcial: la lista existe; el contador en el menú está pendiente.
