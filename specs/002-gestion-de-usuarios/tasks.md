# Tareas 002 · Gestión de usuarios

Leyenda: `[x]` hecha · `[~]` parcial · `[ ]` pendiente.

- [x] **T1 · Alta de cuenta con hash de contraseña** — RF-1.1, RF-4.1
  Hecho cuando: pasa "hashes the password with argon2 and never returns it (BE-28)".
- [x] **T2 · Vínculo cuenta-cliente (RN-14)** — RF-1.5, RF-1.6
  Hecho cuando: pasa "rejects binding a staff user to a customer (RN-14)".
- [x] **T3 · Usuario duplicado** — RF-1.4
  Hecho cuando: pasa "rejects a duplicated username".
- [x] **T4 · Listado con inactivos solo para el administrador** — RF-2
  Hecho cuando: pasa "includes inactive users only for ADMIN".
- [x] **T5 · Edición con reglas de rol** — RF-3
  Hecho cuando: pasan los cinco tests de edición (nombre/rol, personal↔cliente, rol propio, renombrarse, 404).
- [x] **T6 · Reinicio de contraseña** — RF-4.1
  Hecho cuando: pasa "stores only the new argon2 hash".
- [x] **T7 · Desactivar / reactivar** — RF-5
  Hecho cuando: pasan los cuatro tests de desactivación y reactivación.
- [x] **T8 · Técnico asignable** — RF-6
  Hecho cuando: pasa "only accepts active technicians as assignees (RN-06)".
- [x] **T9 · Validación de forma de usuario y contraseña** — RF-1.2, RF-1.3
  Hecho cuando: existe un test que rechaza un usuario con mayúsculas y una contraseña sin dígito.
  *Evidencia: `dto-limits.spec` "rejects usernames with uppercase… [002/RF-1.2]" y "rejects weak passwords… [002/RF-1.3]".*
- [x] **T10 · Test de cliente inexistente al crear cuenta Cliente** — RF-1.5
  Hecho cuando: un test espera 404 al crear una cuenta Cliente con un `customerId` desconocido.
  *Evidencia: `spec-rules.spec` "requires the linked customer of a Cliente account to exist [002/RF-1.5]".*
- [x] **T11 · Test e2e del reinicio de contraseña** — RF-4.2
  Hecho cuando: tras reiniciar la contraseña, una credencial de renovación anterior responde 401.
  *Evidencia: e2e `spec-coverage` "ends the previous sessions of an account when an admin resets its password [002/RF-4.2]".*
- [x] **T12 · Mensajes de error en español** — RNF-3
  Hecho cuando: los mensajes del módulo están en español y los tests los comprueban.
  *Evidencia: todos los textos del módulo están en español; `validation-messages.spec` y `all-exceptions.filter.spec` lo comprueban.*
- [ ] **T13 · Resolver protección del último administrador** — duda abierta
  Hecho cuando: el cliente responde y la regla queda en la spec como RF o como fuera de alcance.
