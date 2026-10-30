# Tareas 005 · Consulta de órdenes y panel de control

Leyenda: `[x]` hecha · `[~]` parcial · `[ ]` pendiente.

- [x] **T1 · Parseo de la búsqueda (función pura)** — RF-2.2 a RF-2.4
  Hecho cuando: pasan los tests "ignores empty or blank input", "keeps free text without a number" y "does not read numbers beyond the INTEGER column…".
- [x] **T2 · Estados activos y atrasados** — RF-4.1, RF-4.2
  Hecho cuando: pasan "treats every non-terminal status as active" y "never counts an order ready for pickup as overdue".
- [x] **T3 · Listado paginado con filtros** — RF-1
  Hecho cuando: pasa "passes the front desk filters through".
- [x] **T4 · Alcance del técnico al listar y buscar** — RF-3
  Hecho cuando: pasan "forces technicians to their own queue (RN-06)" y "keeps the technician scope when searching (RN-06)".
- [x] **T5 · Resumen del panel** — RF-4.1 a RF-4.3
  Hecho cuando: pasan "counts active orders without the terminal states", "lists every status, zeros included" y "asks for overdue orders among the statuses the shop still works on".
- [x] **T6 · Detalle con transiciones permitidas por rol** — RF-5.1
  Hecho cuando: pasa "returns only the transitions the viewer may trigger (FE-08)".
- [x] **T7 · Límite de 100 caracteres en la búsqueda** — RF-2.5
  Hecho cuando: el DTO declara el máximo (revisión de `QueryWorkOrdersDto`) *(sin test propio)*.
- [ ] **T8 · Test: resumen prohibido a técnico y cliente** — RF-4.4
  Hecho cuando: dos pruebas e2e reciben 403.
- [ ] **T9 · Test: página fuera de rango** — RF-1.1
  Hecho cuando: pedir la página 99 devuelve `data: []` y el `total` correcto.
- [ ] **T10 · Test: el detalle nunca expone el código** — RF-5.1
  Hecho cuando: la respuesta no contiene `unlockCode` ni `unlockCodeCipher` para ningún rol.
- [ ] **T11 · Test del límite de 100 caracteres** — RF-2.5
  Hecho cuando: una búsqueda de 101 caracteres responde 400.
