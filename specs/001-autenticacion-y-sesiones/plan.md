# Plan 001 · Autenticación y sesiones

Cumple la [constitución](../../docs/constitution.md) (C3.2 capas, C5.5 secretos, C7.1 roles). Cubre RF-1 a RF-7 de [spec.md](spec.md).

## 1. Estructura de módulos

| Módulo / archivo (`servicio_back/src`) | Responsabilidad | RF |
| --- | --- | --- |
| `modules/auth/auth.controller.ts` | Rutas de login, refresh, logout y profile; límite de intentos | RF-1, RF-2, RF-3, RF-5, RF-6 |
| `modules/auth/auth.service.ts` | Verifica credenciales, emite y rota tokens, detecta reutilización | RF-1 a RF-4 |
| `modules/auth/repositories/` | Acceso a `RevokedRefreshToken` y a `User` | RF-2, RF-3 |
| `modules/auth/jwt.strategy.ts` | Valida el access token y arma el usuario autenticado | RF-7 |
| `common/guards/` (`JwtAuthGuard`, `RolesGuard`) | Guardas globales: sesión y rol | RF-7 |
| `common/decorators/` (`@Public`, `@Roles`) | Declaran excepciones y roles permitidos por ruta | RF-7 |

## 2. Modelo de datos

```json
{
  "User": {
    "id": "6f1c…-uuid",
    "username": "tecnico01",
    "passwordHash": "$argon2id$…",
    "role": "TECHNICIAN",
    "isActive": true,
    "updatedAt": "2026-10-19T14:02:11.000Z"
  },
  "RevokedRefreshToken": {
    "jti": "c0a8…-uuid",
    "userId": "6f1c…-uuid",
    "expiresAt": "2026-10-26T14:02:11.000Z"
  }
}
```

El access token lleva `{ sub, role, customerId? }`; el refresh token lleva además `jti` e `iat`.

## 3. Algoritmos (pseudocódigo)

Describe lo que el código **hace hoy**; las diferencias con la spec se listan en la sección 3.1.

```text
login(username, password):                                  # RF-1
  user = users.findByUsername(trim(username))
  if !user or !user.isActive: throw 401 "Credenciales … incorrectas o usuario inactivo"   # RF-1.2
  if !argon2.verify(user.passwordHash, password): throw 401 (mismo mensaje)
  return issuePair(user)

issuePair(user):
  jti = uuid()
  access  = sign({sub, role}, JWT_SECRET, 15m)
  refresh = sign({sub, role, jti}, JWT_REFRESH_SECRET, 7d)
  return {access, refresh}

refresh(token):                                              # RF-2
  claims = verify(token, JWT_REFRESH_SECRET) or throw 401
  if claims.jti missing: throw 401                           # RF-2.3
  user = users.findActiveById(claims.sub) or throw 401
  if claims.iat < floor(user.updatedAt / 1000): throw 401    # RF-4 (en segundos: mismo segundo se acepta)
  if denylist.has(claims.jti):                               # RF-2.2
      denylist.deleteManyByUser(user.id)                     # ← ver 3.1: BORRA filas, no revoca
      throw 401
  denylist.add(claims.jti, claims.exp)                       # rotación (RF-2.1)
  denylist.deleteExpired(now)
  return issuePair(user)

logout(token):                                               # RF-3
  claims = verify(token) or throw 401
  if !denylist.has(claims.jti): denylist.add(claims.jti, claims.exp)   # idempotente
```

### 3.1 Discrepancias entre la spec y la implementación (detectadas al redactar este plan)

| # | Qué dice la spec | Qué hace el código | Impacto |
| --- | --- | --- | --- |
| D1 | **RF-2.2** invalida *todas* las sesiones de la persona al detectar reutilización | `deleteManyByUser` ejecuta `DELETE` sobre `revoked_refresh_tokens` del usuario: elimina las marcas de revocación, de modo que las credenciales ya rotadas **vuelven a ser aceptables** hasta su expiración natural (7 días). Además, como los tokens no se listan por usuario, las credenciales vivas no se revocan | **Seguridad, media-alta.** La detección de robo no protege; incluso puede reabrir una credencial robada |
| D2 | **RNF-3** nada revela si un usuario existe | Los mensajes son iguales, pero un usuario inexistente responde sin ejecutar `argon2.verify`, por lo que el *tiempo* de respuesta lo delata (la consulta pública del cliente sí compara contra un hash ficticio) | **Seguridad, baja.** Enumeración de usuarios por tiempo; mitigada por el límite de 10 intentos/min |

| D3 | **RF-7.3 / constitución C7.1:** toda ruta exige un rol explícito | `RolesGuard` devuelve `true` cuando la ruta no declara `@Roles` (cualquier usuario autenticado pasa, incluido un cliente). Hoy solo afecta a `logout` y `profile`, que lo necesitan | **Seguridad, media.** Una ruta nueva sin decorador queda abierta a todos los roles |

**Estado (2026-10-29): D1, D2 y D3 corregidas** (tareas T13, T14 y T15 de [tasks.md](tasks.md)).

- D1: la reutilización ahora llama a `invalidateSessions`, que adelanta `updated_at` un segundo; ninguna fila de la lista de denegación se borra.
- D2: el login verifica un hash ficticio cuando no hay cuenta.
- D3: `RolesGuard` rechaza toda ruta sin `@Roles` ni `@Public`; `logout` y `profile` declaran todos los roles.

Efecto secundario aceptado: durante ~1 s después de una reutilización detectada, una sesión recién iniciada no puede renovarse.

## 4. Contrato de uso

| Operación | Método y ruta (`/api/v1`) | Entrada | Salida | Errores |
| --- | --- | --- | --- | --- |
| Iniciar sesión | `POST /auth/login` | `{ username, password }` | `{ accessToken, refreshToken }` | 401 credenciales · 429 límite |
| Renovar | `POST /auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` | 401 |
| Cerrar sesión | `POST /auth/logout` | `{ refreshToken }` | 204 | 401 |
| Perfil | `GET /auth/profile` | — | datos del usuario sin hash | 401 |

Todas las demás rutas exigen `Authorization: Bearer <accessToken>` (RF-7.1).

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| JWT de acceso (15 min) + refresh (7 d) con lista de denegación por `jti` | Permite revocar sin consultar la base en cada petición | Sesiones en servidor: exigen estado compartido (viola C1.1, sin Redis) |
| Rotación + revocación de la familia al reutilizar | Detecta robo de una credencial de renovación | Refresh fijo sin rotación: un robo pasa inadvertido |
| `argon2` para contraseñas | Resistente a hardware dedicado | `bcrypt`: más débil frente a GPU |
| Comparar `iat` con `updatedAt` de la cuenta | Hace efectivo al instante un cambio de rol o contraseña (RF-4) | Esperar a que expire el token (hasta 7 días) |
| Guardas globales (`APP_GUARD`) con `@Public` como excepción | Una ruta olvidada queda protegida por defecto | Guarda por controller: una ruta nueva podría quedar abierta |
| `ThrottlerGuard` por IP, 10/min en login | Frena fuerza bruta sin infraestructura extra | Bloqueo de cuenta: permite denegar servicio a un usuario ajeno |

## 6. Estrategia de tests

| Nivel | Qué cubre | RF |
| --- | --- | --- |
| Unitario `auth.service.spec.ts` | Emisión, 401 uniforme, rotación, reutilización, token sin `jti`, logout idempotente, cambio administrativo | RF-1 a RF-5 |
| e2e `phone-repair-flow.e2e-spec.ts` | Petición sin sesión rechazada y técnico prohibido en ruta de administrador | RF-7 |
| e2e `auth-session` | el 11.º intento fallido recibe 429 con mensaje en español | RF-6 |
| **Pendiente** | Test e2e que reutiliza una credencial rotada y comprueba que **ninguna** credencial anterior vuelve a servir (el unitario actual solo verifica que se llamó a una función simulada) | RF-2.2 |
