# Tareas 004 · Ciclo de vida de la orden de trabajo

Leyenda: `[x]` hecha · `[~]` parcial · `[ ]` pendiente.

- [x] **T1 · Tabla de transiciones y roles** — RF-1.1, RF-1.2
  Hecho cuando: pasan los 6 tests de `work-order-state-machine.spec.ts`.
- [x] **T2 · Servicio único de transición con compare-and-set** — RF-1.3 a RF-1.6, RF-3.2, RF-8.1
  Hecho cuando: pasan los 6 tests de `work-order-transition.service.spec.ts`.
- [x] **T3 · Hook de precondiciones** — RF-4
  Hecho cuando: pasan los 4 tests de `workflow-preconditions.hook.spec.ts`.
- [x] **T4 · Hook Stock Guard (reserva y consumo)** — RF-6
  Hecho cuando: pasan los 5 tests de `inventory-stock-guard.hook.spec.ts`.
- [x] **T5 · Hook de auditoría + triggers inmutables** — RF-7
  Hecho cuando: pasan "applies the transition, runs hooks and writes the audit row (RN-12)" y el e2e "refuses UPDATE and DELETE on the audit table".
- [x] **T6 · Asignación de técnico** — RF-2.1, RF-2.2, RF-2.4
  Hecho cuando: pasa "only accepts active technicians as assignees (RN-06)" y el e2e "requires a technician assignment before diagnosis".
- [x] **T7 · Diagnóstico preliminar** — RF-5
  Hecho cuando: pasa `spec-rules` "saves the diagnosis only while the order is IN_DIAGNOSIS [004/RF-5]" (acepta en En diagnóstico y rechaza fuera de él).
- [x] **T8 · Alcance del técnico sobre sus órdenes** — RF-3
  Hecho cuando: pasan "forbids a technician from reading another technician order (RN-06)" y el e2e "rejects a technician that is not assigned".
  *Evidencia: `spec-rules.spec` "keeps another technician away from the diagnosis [004/RF-3.2]".*
- [x] **T9 · Revelado auditado del código** — RF-9.1 a RF-9.3
  Hecho cuando: pasan "reveals the code to the assigned technician through the audited path", "does not reveal the code to receptionists" y el e2e de revelado.
- [x] **T10 · Carrera por la última unidad** — RF-8.2
  Hecho cuando: pasa el e2e "lets only one of two orders reserve the last unit (RN-09)".
- [x] **T11 · Flujo completo hasta la entrega** — RF-1, RF-7
  Hecho cuando: pasa el e2e "delivers the device and writes one audit row per transition".
- [x] **T12 · Test de reasignación tras iniciar la reparación** — RF-2.3
  Hecho cuando: reasignar una orden En reparación responde 409.
  *Evidencia: `spec-rules.spec` "rejects reassigning once the repair started with a conflict [004/RF-2.3]".*
- [x] **T13 · Test de inmutabilidad del registro de accesos al código** — RF-9.4
  Hecho cuando: un `UPDATE` y un `DELETE` sobre `unlock_code_access_logs` fallan.
  *Evidencia: e2e "refuses UPDATE and DELETE on the unlock code access log [004/RF-9.4]".*
- [x] **T14 · Validación y test del motivo de cancelación** — RF-10.1
  Hecho cuando: un motivo de 2 y de 501 caracteres se rechaza y uno de 3 a 500 se guarda en el historial.
  *Evidencia: `dto-limits.spec` "Transition reason [004/RF-10]" (2 y 501 rechazados; 3 y 500 aceptados).*
- [ ] **T15 · Decidir cancelación posterior a la aprobación y retención del código** — dudas abiertas
  Hecho cuando: el cliente responde y las reglas quedan escritas como RF en esta spec.
