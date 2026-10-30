# Tareas 010 · Vencimiento automático de presupuestos

Leyenda: `[ ]` pendiente. Spec **propuesta**: ninguna tarea está hecha; la base ya existe (`expiresAt`, índice `(status, expires_at)`, vencimiento al decidir).

- [ ] **T1 · Responder las dudas abiertas 1 a 3** — dudas abiertas
  Hecho cuando: el cliente decide qué ocurre con la orden, con cuántos días se alerta y cómo se atribuye el cambio, y la spec queda sin `[NECESITA ACLARACIÓN]`.
- [ ] **T2 · Función pura `effectiveStatus` y `daysUntilExpiry`** — RF-1.1, RF-2.1
  Hecho cuando: pasan los tests unitarios de borde (antes, en y después de `expiresAt`).
- [ ] **T3 · Usar el estado efectivo al responder presupuestos** — RF-1.2
  Hecho cuando: un e2e consulta un presupuesto enviado y vencido y recibe `EXPIRED`.
- [ ] **T4 · Marcado en lote de vencidos (`refreshExpired`)** — RF-1.1, RF-1.3
  Hecho cuando: un test comprueba que solo cambian los `SENT` vencidos y no los demás estados.
- [ ] **T5 · Migración: columna `expiredBy`** — RF-4.1
  Hecho cuando: la migración está revisada y **confirmada por una persona** (regla C5.2) y aplicada en la base de pruebas.
- [ ] **T6 · Ruta de presupuestos por vencer** — RF-2.1
  Hecho cuando: un e2e devuelve solo los del rango con `daysLeft` correcto y los roles no autorizados reciben 403.
- [ ] **T7 · Contador de presupuestos vencidos en el resumen** — RF-2.2
  Hecho cuando: el resumen incluye `expiredBudgets` y un test lo comprueba.
- [ ] **T8 · Regresión: aprobar un vencido sigue fallando** — RF-1.2
  Hecho cuando: el e2e de la spec 006 sigue pasando sin cambios.
