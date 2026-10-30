# Tareas 009 · Credencial de renovación en cookie protegida

Leyenda: `[x]` hecha · `[ ]` pendiente. Spec **propuesta**: solo la primera tarea ya existe.

- [x] **T1 · CORS con credenciales** — RF-5.1
  Hecho cuando: `enableCors` usa `credentials: true` con la lista `CORS_ORIGINS` (commit "allow credentialed CORS requests (SUP-07)").
- [ ] **T2 · Decidir dominio único o cookie entre sitios** — dudas abiertas 1 y 2
  Hecho cuando: queda escrito qué opción se adopta (proxy del frontend o `SameSite=None`) y por cuánto tiempo se mantiene la compatibilidad con el cuerpo.
- [ ] **T3 · Función pura `auth-cookie` (nombre y opciones)** — RF-1.2, RF-1.3
  Hecho cuando: un test unitario comprueba `httpOnly`, `secure`, `path` y `maxAge` de 7 días.
- [ ] **T4 · Instalar y registrar `cookie-parser`** — RF-2.1
  Hecho cuando: `req.cookies` está disponible y `npm ci` pasa con el lock actualizado.
- [ ] **T5 · Login y renovación escriben la cookie** — RF-1.1, RF-2.2
  Hecho cuando: un e2e ve `Set-Cookie` con `HttpOnly` tras iniciar sesión y una cookie nueva tras renovar.
- [ ] **T6 · Renovación y cierre leen la cookie (cuerpo opcional)** — RF-2.1, RF-2.3, RF-6.1
  Hecho cuando: e2e: `refresh` sin cuerpo funciona con cookie; sin cookie ni cuerpo responde 401; con cuerpo sigue funcionando.
- [ ] **T7 · Cierre de sesión borra la cookie** — RF-3.1
  Hecho cuando: un e2e ve `Set-Cookie` con `Max-Age=0` tras cerrar sesión.
- [ ] **T8 · Defensa contra CSRF (Origin + cabecera)** — RF-4
  Hecho cuando: un e2e rechaza `refresh` con `Origin` ajeno y sin la cabecera.
- [ ] **T9 · Variable `CORS_ORIGINS` verificada en producción** — RF-5.1
  Hecho cuando: el despliegue en Render tiene la URL exacta del frontend y la renovación funciona desde esa URL.
- [ ] **T10 · Retirar el cuerpo de la respuesta** — RF-6.1
  Hecho cuando: el frontend (spec 011) ya no envía ni recibe `refreshToken` en el cuerpo y el campo se elimina del contrato.
