# Tareas 006 · Presupuestos y aprobación del cliente

Leyenda: `[x]` hecha · `[~]` parcial · `[ ]` pendiente.

- [x] **T1 · Modelo de presupuesto, líneas y estados** — RF-1, RF-3
  Hecho cuando: existen las tablas `budgets` y `budget_items` en la migración inicial.
- [x] **T2 · Armado con aritmética decimal y precio de catálogo** — RF-1.3, RF-1.4
  Hecho cuando: pasa "computes labor + catalog-priced parts with Decimal arithmetic (RN-15)".
- [x] **T3 · No armar tras la aprobación** — RF-1.5
  Hecho cuando: pasa "refuses to draft a budget once the repair was approved".
- [x] **T4 · Compatibilidad de repuestos** — RF-2
  Hecho cuando: pasan "rejects a part that does not fit the device model (RN-10)" y "rejects unknown or inactive parts".
- [x] **T5 · Envío que mueve la orden a Presupuestado** — RF-4
  Hecho cuando: pasa "sending the first budget moves the order to BUDGETED in the same transaction".
- [x] **T6 · Aprobación atómica con canal** — RF-5
  Hecho cuando: pasa "approval marks the budget and moves the order to APPROVED atomically (RN-05)".
- [x] **T7 · Rechazo que cancela la orden** — RF-6
  Hecho cuando: pasa "rejection cancels the work order with the reason".
- [x] **T8 · Vencimiento al decidir** — RF-7
  Hecho cuando: pasan "rejects approval of an expired budget and marks it EXPIRED (RN-08)", "only SENT budgets can be decided" y el e2e "rejects approval of an expired budget".
- [x] **T9 · Acceso solo para recepción y administración** — RF-8.1
  Hecho cuando: pasa el e2e "does not let technicians read budgets (RN-07)".
- [~] **T10 · Versiones reemplazadas** — RF-3
  Hecho cuando: un test envía dos versiones y la primera queda `SUPERSEDED` sin borrarse.
  *Parcial:* la lógica existe (`supersedeOthers`), sin test que la verifique.
- [ ] **T11 · Test e2e del rechazo con cancelación atómica** — RF-6.1
  Hecho cuando: tras rechazar, la orden está Cancelada y el historial guarda el motivo.
- [ ] **T12 · Test de límites de líneas y cantidades** — RF-1.1, RF-1.2
  Hecho cuando: 0 y 51 líneas y cantidades 0 y 51 responden 400.
- [ ] **T13 · Test: el presupuesto no expone el costo unitario** — RF-8.2
  Hecho cuando: la respuesta de un presupuesto con repuestos no contiene `unitCost`.
