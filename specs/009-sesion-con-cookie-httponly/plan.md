# Plan 009 · Credencial de renovación en cookie protegida

Cumple la [constitución](../../docs/constitution.md) (C1.1 sin infraestructura nueva, C5.5 secretos, C7.2 validación). Cubre RF-1 a RF-6 de [spec.md](spec.md). **Estado: propuesta** (solo RF-5.1 está implementado).

## 1. Estructura de módulos

| Archivo (`servicio_back/src`) | Cambio propuesto | RF |
| --- | --- | --- |
| `main.ts` | `enableCors({ origin: CORS_ORIGINS, credentials: true })` ✅ ya hecho; agregar `cookie-parser` | RF-5.1, RF-2.1 |
| `modules/auth/auth.controller.ts` | Escribir la cookie en `login` y `refresh`; leerla en `refresh` y `logout`; borrarla en `logout` | RF-1, RF-2, RF-3 |
| `modules/auth/auth-cookie.ts` (nuevo, función pura) | Nombre y opciones de la cookie en un solo lugar | RF-1.2, RF-1.3 |
| `modules/auth/dto/refresh.dto.ts` · `logout.dto.ts` | El cuerpo pasa a ser **opcional** | RF-6.1 |
| `common/guards/` | Comprobación de `Origin` y cabecera personalizada en refresh/logout | RF-4 |

## 2. Modelo de datos

Sin cambios en la base. Se agrega un nombre de cookie y su configuración:

```json
{
  "cookie": {
    "name": "refresh_token",
    "value": "<JWT de renovación>",
    "httpOnly": true,
    "secure": true,
    "sameSite": "Lax",
    "path": "/api/v1/auth",
    "maxAge": 604800000
  },
  "respuestaDeLogin": { "accessToken": "…", "refreshToken": "… (solo durante la transición, RF-6.1)" }
}
```

## 3. Algoritmos

```text
setRefreshCookie(res, token):                                   # RF-1
  res.cookie("refresh_token", token, {httpOnly, secure, sameSite, path: "/api/v1/auth", maxAge: 7d})

refresh(req, res):                                              # RF-2
  assertTrustedOrigin(req)                                       # RF-4.1: Origin ∈ CORS_ORIGINS
  assertCustomHeader(req, "X-Requested-With")                    # RF-4.2: no la fabrica un <form> ajeno
  token = req.cookies.refresh_token ?? req.body?.refreshToken    # RF-2.1, RF-6.1
  if !token: throw 401                                           # RF-2.3
  pair = authService.refresh(token)                              # rotación como spec 001
  setRefreshCookie(res, pair.refreshToken)
  return {accessToken: pair.accessToken}                         # sin refreshToken en el cuerpo (tras la transición)

logout(req, res):                                               # RF-3
  authService.logout(token from cookie or body)
  res.clearCookie("refresh_token", {path: "/api/v1/auth"})
```

## 4. Contrato de uso

| Operación | Cambio |
| --- | --- |
| `POST /auth/login` | Respuesta incluye `Set-Cookie: refresh_token=…; HttpOnly; Secure; SameSite=…; Path=/api/v1/auth` |
| `POST /auth/refresh` | Sin cuerpo; lee la cookie; exige `X-Requested-With: XMLHttpRequest` |
| `POST /auth/logout` | Sin cuerpo; borra la cookie |
| CORS | `Access-Control-Allow-Credentials: true` ✅ |

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| Cookie `HttpOnly` | Un script de la página no puede leerla (RNF-1) | `sessionStorage` (hoy): legible por cualquier script |
| `Path=/api/v1/auth` | La cookie solo viaja a las rutas que la usan: menos exposición | `Path=/`: se envía en cada petición |
| **Servir la API bajo el dominio del frontend** (reescritura `/api/v1/*` → servidor) y `SameSite=Lax` | Frontend y servidor quedan en el mismo sitio: sin cookies de terceros, que los navegadores bloquean | `SameSite=None; Secure` entre dominios distintos: funciona hoy en Chrome, pero Safari y los modos de privacidad la descartan |
| Cabecera personalizada + comprobación de `Origin` | Defensa contra CSRF sin tokens ni estado (C1.1) | Token CSRF con almacenamiento: más estado y complejidad |
| Mantener el cuerpo opcional durante la transición | Despliegue del backend y del frontend en momentos distintos | Cambio simultáneo: ventana de errores |

## 6. Estrategia de tests

| Nivel | Test propuesto | RF |
| --- | --- | --- |
| e2e | El login responde `Set-Cookie` con `HttpOnly`, `Secure`, `Path` y `Max-Age` | RF-1 |
| e2e | `refresh` sin cuerpo y con cookie rota la credencial y reemplaza la cookie | RF-2.1, RF-2.2 |
| e2e | `refresh` sin cookie → 401 | RF-2.3 |
| e2e | `logout` borra la cookie (`Max-Age=0`) | RF-3 |
| e2e | `refresh` desde un `Origin` no permitido o sin la cabecera → rechazado | RF-4 |
| e2e | `refresh` con credencial en el cuerpo sigue funcionando durante la transición | RF-6.1 |
| Unitario | Opciones de cookie en `auth-cookie` | RF-1.2 |
