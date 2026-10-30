# Plan 008 · Seguimiento del equipo por el cliente

Cumple la [constitución](../../docs/constitution.md) (C7.1 `@Public` solo en excepciones, C7.3 pertenencia en el service, C5.5 secretos). Cubre RF-1 a RF-7 de [spec.md](spec.md).

## 1. Estructura de módulos

| Archivo (`servicio_back/src`) | Responsabilidad | RF |
| --- | --- | --- |
| `domain/work-orders/tracking-code.ts` | Alfabeto, generación aleatoria, normalización, formato, `parseWorkOrderNumber` | RF-1, RF-2.2 |
| `modules/work-orders/dto/public-tracking.dto.ts` | `number` y `trackingCode` con transformación y validación de formato | RF-2.2, RF-2.3 |
| `modules/work-orders/public-tracking.controller.ts` | `@Public` + `@Throttle(5/min)` | RF-2.1, RF-4 |
| `modules/work-orders/work-orders.service.ts` → `create`, `regenerateTrackingCode`, `trackPublicly`, `listForCustomer` | Generación y verificación del código; vista del cliente | RF-1 a RF-7 |
| `modules/work-orders/dto/work-order.response.dto.ts` → `CustomerWorkOrderStatusDto` | Lista explícita de campos visibles al cliente | RF-5 |
| `modules/work-orders/repositories/work-order.repository.ts` | `findForPublicTracking`, `findForCustomer`, `setTrackingCodeHash` | RF-2, RF-6, RF-7 |

## 2. Modelo de datos

Una columna en la orden (migración `add_work_order_tracking_code`):

```json
{
  "WorkOrder": { "id": "…", "number": 123, "trackingCodeHash": "$argon2id$v=19$m=65536,t=3,p=4$…" }
}
```

Vista pública del cliente (`CustomerWorkOrderStatusDto`):

```json
{
  "id": "…", "number": 123,
  "status": "IN_REPAIR", "statusLabel": "En Reparación",
  "device": "Apple iPhone 13",
  "promisedAt": "2026-10-25T18:00:00.000Z",
  "budgetTotal": "1130.00",
  "updatedAt": "2026-10-20T15:31:08.000Z"
}
```

Petición: `{ "number": "OT-000123", "trackingCode": "k7qm-3xpa" }` → normalizada a `{ number: 123, trackingCode: "K7QM3XPA" }`.

## 3. Algoritmos

```text
ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # 31 símbolos, sin 0 O 1 I L

generate():                                                     # RF-1.1
  return 8 caracteres elegidos con randomInt (CSPRNG) del ALFABETO

generateDistinctFrom(unlockCode):                               # RF-1.4, RF-6.2
  forbidden = unlockCode ? normalize(unlockCode) : none
  repeat code = generate() until code != forbidden

create(...):                                                    # RF-1.2, RF-1.3
  code = generateDistinctFrom(dto.unlockCode)
  hash = argon2.hash(code)                      # fuera de la transacción
  ...persistir orden con trackingCodeHash = hash...
  return {..., trackingCode: format(code)}      # "ABCD-EFGH", única vez

trackPublicly(dto):                                             # RF-2, RF-3
  order = repo.findForPublicTracking(dto.number)
  hash  = order?.trackingCodeHash ?? dummyHash()                # mismo costo exista o no
  ok    = argon2.verify(hash, dto.trackingCode) catch false
  if !order?.trackingCodeHash or !ok: throw 404 TRACKING_NOT_FOUND   # único mensaje
  return toCustomerStatus(order)                                # lista explícita de campos

regenerate(id):                                                 # RF-6
  order = requireExisting(id)
  unlock = order.unlockCodeCipher ? decrypt(order.unlockCodeCipher) : none
  code = generateDistinctFrom(unlock) ; repo.setTrackingCodeHash(id, argon2.hash(code))
  return {trackingCode: format(code)}                           # el hash anterior desaparece

listForCustomer(user):                                          # RF-7
  if !user.customerId: 403
  return repo.findForCustomer(user.customerId).map(toCustomerStatus)
requireVisible: si user.role == CUSTOMER y order.customerId != user.customerId → 404
```

## 4. Contrato de uso (`/api/v1`)

| Operación | Ruta | Acceso | Notas |
| --- | --- | --- | --- |
| Consulta pública | `POST /public/tracking` `{number, trackingCode}` | Público, 5/min por IP | 200 vista · 404 uniforme · 429 · 400 formato |
| Mis órdenes | `GET /work-orders/mine` | Cliente | lista de vistas · 403 sin vínculo |
| Reponer código | `POST /work-orders/:id/tracking-code/regenerate` | Admin, Recepción | `{trackingCode}` una vez |
| Abrir orden | `POST /work-orders` | Admin, Recepción | incluye `trackingCode` en la respuesta |

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| Código aleatorio de 8 símbolos sin ambiguos | Se dicta y se lee sin errores; 8,5·10¹¹ combinaciones | Usar el PIN del celular: el cliente lo comparte y es adivinable (RN-03) |
| Guardar solo el hash `argon2` | Aunque se filtre la base, los códigos no se recuperan | Guardar en claro o cifrado: permitiría reimprimir, pero también filtrar |
| Verificar contra un hash ficticio si no hay orden | El tiempo no revela qué números existen (RF-3.2) | Responder rápido cuando no existe: enumeración por tiempo |
| 404 idéntico para número inexistente y código erróneo | No filtra existencia (RF-3.1) | 403 para código erróneo: confirma que la orden existe |
| `@Throttle` 5/min por IP | Frena la fuerza bruta sin estado extra (C1.1) | CAPTCHA: dependencia externa y fricción |
| Lista explícita de campos del DTO del cliente | Un campo nuevo en la orden nunca se filtra por accidente (RN-14) | Devolver la fila y borrar campos |
| Mismo mapeo para ambos modos de acceso | Un solo lugar que auditar | Dos formatos distintos |

## 6. Estrategia de tests

| Nivel | Tests | RF |
| --- | --- | --- |
| Unitario `tracking-code.spec.ts` | 8 caracteres sin ambiguos · distinto del código de desbloqueo · formato y normalización · número no numérico · formatos del ticket · PIN de 4 dígitos rechazado · números mal formados y campos extra | RF-1, RF-2 |
| Unitario `work-orders.service.spec.ts` | devuelve el código una vez y guarda solo el hash · solo la vista del cliente · mismo 404 · rechaza órdenes sin hash · regenera distinto del desbloqueo · cliente ajeno recibe 404 | RF-1, RF-3, RF-5, RF-6, RF-7.3 |
| e2e (bloque SUP-05) | nunca guarda ni devuelve el código en claro (1/5) · vista sin sesión · mismo 404 (2/5, 3/5) · el código anterior queda invalidado (4/5, 5/5) · el sexto intento recibe 429 | RF-1 a RF-4, RF-6 |
| e2e (cliente) | "lists only status information for the customer" · "blocks staff endpoints for customers" | RF-5, RF-7 |
| Unitario `spec-rules` | un número inexistente ejecuta igualmente la verificación de hash | RF-3.2 |
| Unitario + e2e | la vista del cliente tiene exactamente 8 campos aunque la fila traiga más | RF-5.2 |
