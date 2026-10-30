# Tareas 001 · Autenticación y sesiones

Cada tarea cabe en 20–30 minutos. `[x]` = hecha y verificada (spec retroactiva: se marcan con la evidencia que ya existe en el proyecto).

- [x] **T1 · Modelo de usuario y de tokens revocados** — RF-1, RF-2, RF-3
  Hecho cuando: existen las tablas `users` y `revoked_refresh_tokens` en la migración inicial.
- [x] **T2 · Verificación de credenciales con respuesta uniforme** — RF-1.1, RF-1.2
  Hecho cuando: los tests "returns 401 for an unknown or inactive user…" y "…password is incorrect" pasan.
- [x] **T3 · Emisión del par de tokens** — RF-1.1
  Hecho cuando: el test "returns an access + refresh token pair…" pasa.
- [x] **T4 · Renovación con rotación** — RF-2.1, RF-2.3
  Hecho cuando: pasan "rotates the used refresh token…" y "returns 401 when a refresh token has no jti".
- [~] **T5 · Detección de reutilización** — RF-2.2
  Hecho cuando: pasa "revokes the whole user family… when the refresh token was reused".
  *Parcial:* el test pasa, pero solo comprueba una llamada simulada; el comportamiento real incumple la spec (discrepancia D1 del plan). Se cierra con T13.
- [x] **T6 · Cierre de sesión idempotente** — RF-3
  Hecho cuando: pasan los tres tests de logout.
- [x] **T7 · Invalidación por cambio administrativo** — RF-4
  Hecho cuando: pasan "rejects a refresh token minted before the last admin change…" y "accepts… within the same second".
- [x] **T8 · Perfil sin datos secretos** — RF-5
  Hecho cuando: pasa "returns the profile of an active user without the hash".
- [x] **T9 · Guardas globales y decoradores `@Public` / `@Roles`** — RF-7
  Hecho cuando: los e2e "rejects unauthenticated requests" y "forbids a technician from creating spare parts" pasan.
- [x] **T10 · Límite de 10 intentos por minuto en el login** — RF-6.1
  Hecho cuando: la ruta de login lleva el límite configurado (revisión del controller).
- [ ] **T11 · Test e2e del límite de login** — RF-6.1
  Hecho cuando: un test hace 11 intentos fallidos en un minuto y el 11.º responde 429.
- [ ] **T12 · Decidir recuperación de contraseña** — dudas abiertas
  Hecho cuando: la duda de la spec está respondida por el cliente y registrada como `SUP-xx`.
- [ ] **T13 · Corregir la revocación de la familia de credenciales** — RF-2.2
  Hecho cuando: un test e2e reutiliza una credencial ya rotada y después ninguna credencial anterior de esa persona renueva la sesión.
- [ ] **T14 · Igualar el tiempo de respuesta del login** — RNF-3
  Hecho cuando: el login de un usuario inexistente ejecuta una verificación contra un hash ficticio y un test unitario lo comprueba.

- [ ] **T15 · Denegar por defecto las rutas sin `@Roles`** — RF-7.3, constitución C7.1
  Hecho cuando: `RolesGuard` rechaza una ruta sin `@Roles` ni `@Public`, `logout` y `profile` declaran todos los roles explícitamente y un test comprueba ambas cosas.

Leyenda: `[x]` hecha · `[~]` parcial · `[ ]` pendiente.
