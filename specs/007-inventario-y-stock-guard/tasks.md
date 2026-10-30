# Tareas 007 · Inventario de repuestos y Stock Guard

Leyenda: `[x]` hecha · `[~]` parcial · `[ ]` pendiente.

- [x] **T1 · Modelo de repuesto, compatibilidad y kardex + CHECK de existencias** — RF-1, RF-4, RF-7
  Hecho cuando: la migración inicial crea `spare_parts`, `spare_part_compatibilities`, `stock_movements` y `spare_parts_stock_non_negative`.
- [x] **T2 · Alta, edición y baja del catálogo** — RF-1
  Hecho cuando: pasa "refuses to deactivate a part with reserved units" y el e2e "forbids a technician from creating spare parts".
- [x] **T3 · Visibilidad de costo y precio por rol** — RF-2.2, RF-2.3
  Hecho cuando: pasa "shows unit cost to ADMIN only and hides prices from TECHNICIAN (RN-07)" y el e2e "hides prices from technicians".
- [x] **T4 · Entradas con kardex** — RF-3.1
  Hecho cuando: pasa "records a kardex row for each stock entry (BE-17)".
- [x] **T5 · Ajustes limitados a lo disponible** — RF-3.2, RF-3.3
  Hecho cuando: pasa "blocks a write-off larger than the unreserved stock (RN-11)".
- [x] **T6 · Reserva y consumo atómicos** — RF-5.1, RF-5.3
  Hecho cuando: pasan "reserves every pending part line when entering IN_REPAIR" y "consumes reserved lines when entering QUALITY_CONTROL".
- [x] **T7 · Bloqueo por falta de stock con lista de faltantes** — RF-5.2
  Hecho cuando: pasa "blocks the transition listing every part without stock".
- [x] **T8 · Competencia por la última unidad** — RF-5.4, RF-4.1
  Hecho cuando: pasa el e2e "lets only one of two orders reserve the last unit (RN-09)".
- [x] **T9 · Alertas de stock bajo** — RF-6
  Hecho cuando: pasan "flags low stock when available <= min stock (RN-11)" y el e2e de alerta.
- [x] **T10 · Precios y compatibilidad para presupuestos** — RF-2 (spec 006)
  Hecho cuando: pasan "prices compatible parts from the catalog (RN-10)" y "rejects a part that does not fit the device model (RN-10)".
- [x] **T11 · Triggers de inmutabilidad del kardex** — RF-7.2
  Hecho cuando: un test intenta `UPDATE` y `DELETE` sobre `stock_movements` y ambos fallan.
  *Evidencia: e2e "refuses UPDATE and DELETE on the stock ledger [007/RF-7.2]".*
- [x] **T12 · Test de validación del SKU** — RF-1.1
  Hecho cuando: SKU en minúsculas, de 2 caracteres y duplicado responden 400/409.
  *Evidencia: `dto-limits.spec` "Spare part catalog [007/RF-1.1]".*
- [x] **T13 · Test de modelos compatibles inexistentes** — RF-1.6
  Hecho cuando: un alta con un `deviceModelId` desconocido responde 422.
  *Evidencia: `spec-rules.spec` "rejects compatible device models that do not exist [007/RF-1.6]".*
- [ ] **T14 · Resolver momento del descuento físico y liberación de reservas** — dudas abiertas
  Hecho cuando: el cliente responde (SUP-02, SUP-08) y la regla queda escrita como RF.
