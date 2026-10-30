# Tareas 003 · Recepción del equipo y registro de dispositivos

Leyenda: `[x]` hecha · `[~]` parcial · `[ ]` pendiente.

- [x] **T1 · Función pura de IMEI (Luhn)** — RF-1.1, RF-1.2
  Hecho cuando: pasan los 4 tests de `imei.spec.ts`.
- [x] **T2 · Decorador y pipe de IMEI** — RF-1.3
  Hecho cuando: pasa "propagates the nested IMEI Luhn error" y el e2e "rejects an IMEI that fails Luhn".
- [x] **T3 · DTO de ingreso (problema, cosmético, batería, bloqueo)** — RF-3
  Hecho cuando: pasan "accepts a complete intake", "rejects battery outside 0-100 and unknown cosmetic values" y "rejects unexpected fields".
- [x] **T4 · Cifrado AES-256-GCM del código** — RF-4.2
  Hecho cuando: pasan los 4 tests de `unlock-code-cipher.spec.ts`.
- [x] **T5 · Código obligatorio según el bloqueo** — RF-4.1
  Hecho cuando: pasan "requires an unlock code for protected devices" y "accepts a pattern and a device without lock".
- [x] **T6 · Registro de equipo: nuevo, reutilizado y conflicto** — RF-6
  Hecho cuando: pasan "registers a new device…", "reuses the device… (RN-13)", "rejects a known IMEI declared with another model (RN-02)" y "rejects an unknown or inactive device model".
- [x] **T7 · Apertura de la orden con código cifrado** — RF-2.1, RF-4.2, RF-4.3
  Hecho cuando: pasa "encrypts the unlock code before persisting it and never returns it (RN-03)" y el e2e "never stores or returns the unlock code in plaintext".
- [x] **T8 · Fecha compromiso futura** — RF-3.4
  Hecho cuando: pasa "rejects a promised date in the past".
- [x] **T9 · Historial por IMEI** — RF-5
  Hecho cuando: pasa "returns 404 for an unregistered IMEI lookup" y el e2e de ingreso consulta el historial con 200.
- [x] **T10 · Catálogo de modelos** — RF-7
  Hecho cuando: pasan los 6 tests de modelos de `devices.service.spec.ts`.
- [ ] **T11 · Test de atomicidad del ingreso** — RF-2.2
  Hecho cuando: un test fuerza un error al crear la orden y comprueba que no quedó cliente nuevo ni equipo nuevo.
- [ ] **T12 · Test de transferencia por reventa** — RF-6.3
  Hecho cuando: un test ingresa un IMEI conocido con otro documento y el equipo conserva sus órdenes y cambia de dueño.
- [ ] **T13 · Política de retención del código de desbloqueo** — duda abierta (SUP-09)
  Hecho cuando: el cliente decide si se borra al entregar y queda como RF en la spec 004.
