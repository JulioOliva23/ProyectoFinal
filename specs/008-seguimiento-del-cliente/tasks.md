# Tareas 008 · Seguimiento del equipo por el cliente

Leyenda: `[x]` hecha · `[~]` parcial · `[ ]` pendiente.

- [x] **T1 · Dominio del código (alfabeto, generación, normalización)** — RF-1.1, RF-2.2
  Hecho cuando: pasan los tests de formato y normalización de `tracking-code.spec.ts`.
- [x] **T2 · Código distinto del de desbloqueo** — RF-1.4, RF-6.2
  Hecho cuando: pasa "is never equal to the device unlock code (RN-03)".
- [x] **T3 · Columna `tracking_code_hash` + migración** — RF-1.3
  Hecho cuando: existe la migración `20261019120000_add_work_order_tracking_code`.
- [x] **T4 · Entrega única del código al abrir la orden** — RF-1.2
  Hecho cuando: pasa "returns the tracking code once and stores only its argon2 hash (SUP-05)".
- [x] **T5 · DTO de la consulta pública con formato estricto** — RF-2.2, RF-2.3
  Hecho cuando: pasan "rejects a 4-digit PIN-like code" y "rejects malformed numbers and extra fields".
- [x] **T6 · Consulta pública con respuesta uniforme** — RF-2.1, RF-3.1, RF-3.3
  Hecho cuando: pasan "returns only the customer status view for a valid code", "answers the same 404…" y "rejects orders created before SUP-05".
- [x] **T7 · Límite de 5 intentos por minuto** — RF-4.1
  Hecho cuando: pasa el e2e "throttles the 6th attempt within a minute".
- [x] **T8 · Vista del cliente con campos explícitos** — RF-5.1
  Hecho cuando: pasan "returns only the customer status view…" y el e2e "lists only status information for the customer".
- [x] **T9 · Reposición del código** — RF-6.1
  Hecho cuando: pasan "regenerates the code, never matching the unlock code, and replaces the hash" y el e2e "invalidates the previous code when a new one is issued".
- [x] **T10 · Consulta con cuenta de cliente y pertenencia** — RF-7
  Hecho cuando: pasan "answers 404 to a customer probing a foreign order (RN-14)" y el e2e "blocks staff endpoints for customers".
- [ ] **T11 · Test de igualdad de tiempo de respuesta** — RF-3.2
  Hecho cuando: la mediana del tiempo con orden inexistente está dentro de un margen razonable de la de código erróneo.
- [ ] **T12 · Test de lista cerrada de campos del cliente** — RF-5.2
  Hecho cuando: la respuesta contiene exactamente los campos de la spec y ninguno más.
- [ ] **T13 · Test de cuenta de cliente sin vínculo** — RF-7.2
  Hecho cuando: un usuario Cliente sin `customerId` recibe 403 en "mis órdenes".
