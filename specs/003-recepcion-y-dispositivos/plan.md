# Plan 003 · Recepción del equipo y registro de dispositivos

Cumple la [constitución](../../docs/constitution.md) (C3.1 dominio puro, C5.5 secreto cifrado, C7.2 DTO). Cubre RF-1 a RF-7 de [spec.md](spec.md).

## 1. Estructura de módulos

| Archivo (`servicio_back/src`) | Responsabilidad | RF |
| --- | --- | --- |
| `domain/devices/imei.ts` | Función pura: normaliza y valida Luhn | RF-1 |
| `modules/devices/validators/` + `pipes/` | Decorador `@IsImei()` y pipe de la ruta de consulta | RF-1 |
| `modules/devices/dto/device-check-in.dto.ts` | Validación de IMEI, modelo, color y datos del cliente | RF-1, RF-3.6 |
| `modules/work-orders/dto/create-work-order.dto.ts` | Validación del ingreso: problema, cosmético, batería, bloqueo, fecha | RF-3, RF-4.1 |
| `modules/devices/devices.service.ts` | `checkIn` (reuso, transferencia, conflicto), historial, catálogo de modelos | RF-5, RF-6, RF-7 |
| `modules/work-orders/work-orders.service.ts` → `create` | Orquesta la transacción de ingreso y cifra el código | RF-2, RF-4 |
| `common/crypto/unlock-code-cipher.ts` | AES-256-GCM con IV aleatorio | RF-4.2 |
| `modules/devices/repositories/device.repository.ts` | Único acceso a `Device`, `DeviceModel`, `Customer` | todos |

## 2. Modelo de datos

```json
{
  "Customer": { "id": "…", "identification": "5123456", "name": "María Quispe", "phone": "+591 71234567", "email": null },
  "DeviceModel": { "id": "…", "brand": "Apple", "model": "iPhone 13", "isActive": true },
  "Device": { "id": "…", "imei": "356938035643809", "color": "Negro", "deviceModelId": "…", "customerId": "…" },
  "WorkOrder": {
    "id": "…", "number": 123, "status": "RECEIVED",
    "reportedProblem": "No carga y la pantalla está fisurada",
    "batteryLevel": 12,
    "cosmeticCheckIn": { "screen": "CRACKED", "backCover": "OK", "frame": "SCRATCHED", "cameraLens": "OK", "buttons": "OK", "notes": "Marco con golpe en la esquina" },
    "lockType": "PIN",
    "unlockCodeCipher": "Qk1…==.Z0x…==.c3R…==",
    "promisedAt": "2026-10-25T18:00:00.000Z",
    "trackingCodeHash": "$argon2id$…",
    "receptionistId": "…"
  }
}
```

Formato del cifrado: `base64(iv).base64(authTag).base64(ciphertext)`.

## 3. Algoritmos

```text
normalizeImei(raw): return raw.replace(/[\s-]/g, "")                          # RF-1.2
isValidImei(v):                                                               # RF-1.1
  if !/^\d{15}$/.test(v): return false
  return luhnChecksum(v) == 0
luhnChecksum(digits):
  sum = 0
  for i in 0..len-1:                      # de derecha a izquierda
      d = digits[len-1-i]
      if i % 2 == 1: d = d*2; if d > 9: d = d-9
      sum += d
  return sum % 10

create(dto, user):                                                            # RF-2
  if dto.promisedAt and dto.promisedAt <= now: throw 422                      # RF-3.4
  tracking = generateTrackingCodeDistinctFrom(dto.unlockCode)                 # spec 008
  hash = argon2.hash(tracking)                  # fuera de la transacción: es lento
  tx:
     checked = devices.checkIn(tx, dto.device, dto.customer)
     order = repo.create(tx, {..., receptionistId: user.id,
               unlockCodeCipher: dto.unlockCode ? cipher.encrypt(dto.unlockCode) : null})
  return {...toResponse(order), trackingCode: format(tracking)}               # solo esta vez

checkIn(tx, device, customer):                                                # RF-6
  if !activeModel(device.deviceModelId): throw 422                            # RF-6.4
  owner = upsertCustomer(tx, customer)           # por documento; actualiza contacto
  existing = findByImei(tx, device.imei)
  if existing and existing.deviceModelId != device.deviceModelId: throw 409   # RF-6.2
  return existing ? updateOwnership(existing.id, owner.id, color)             # RF-6.1, RF-6.3
                  : create(device, owner.id)

validar unlockCode según lockType:                                            # RF-4.1
  NONE: debe omitirse · PIN: 4–16 dígitos · PATTERN: "1-5-9-6" · PASSWORD: 1–64 caracteres
```

## 4. Contrato de uso (`/api/v1`)

| Operación | Ruta | Roles | Entrada → salida |
| --- | --- | --- | --- |
| Abrir orden | `POST /work-orders` | Admin, Recepción | `{customer, device, reportedProblem, batteryLevel?, cosmeticCheckIn, lockType, unlockCode?, promisedAt?}` → orden + `trackingCode` · 409 · 422 |
| Historial | `GET /devices/by-imei/:imei` | Admin, Recepción, Técnico | → dispositivo + `repairs[]` · 404 |
| Listar modelos | `GET /device-models?includeInactive=` | Admin, Recepción, Técnico | → modelos |
| Crear modelo | `POST /device-models` | Admin | `{brand, model}` → modelo · 409 |
| Editar modelo | `PATCH /device-models/:id` | Admin | `{brand?, model?, isActive?}` → modelo · 404 · 409 |

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| Cifrar con AES-256-GCM (reversible) | El técnico necesita el código real para probar el equipo (SUP-09); GCM detecta manipulación | Hash (argon2): irrecuperable, inútil para el técnico |
| IV aleatorio por cifrado | Dos códigos iguales no producen el mismo texto cifrado | IV fijo: filtra repeticiones |
| Luhn en `domain/` | Reutilizable y probable sin Nest ni Prisma (C3.1) | Validar solo en el DTO: lógica atada al framework |
| Cliente identificado por documento (`upsert`) | Un mismo cliente no se duplica entre ingresos | Crear siempre uno nuevo: historial fragmentado |
| Alta de cliente, equipo y orden en una transacción | Evita equipos huérfanos si falla a mitad (RF-2.2) | Tres llamadas separadas: estados parciales |
| Hash del código de seguimiento fuera de la transacción | `argon2` es deliberadamente lento y retendría la conexión | Dentro de la transacción: bloqueos más largos |

## 6. Estrategia de tests

| Nivel | Tests | RF |
| --- | --- | --- |
| Unitario `imei.spec.ts` | dígito erróneo, normalización, cálculo Luhn | RF-1 |
| Unitario `device-check-in.dto.spec.ts` | normaliza y acepta · rechaza dígito erróneo · propaga el error anidado · exige código con bloqueo · acepta patrón y sin bloqueo · batería fuera de rango y condición desconocida · rechaza campos extra | RF-1, RF-3, RF-4.1 |
| Unitario `devices.service.spec.ts` | registra equipo nuevo · reutiliza por IMEI · conflicto de modelo · modelo inactivo · 404 de historial · crear/renombrar/activar modelos · inactivos solo Admin | RF-5, RF-6, RF-7 |
| Unitario `work-orders.service.spec.ts` | cifra el código y no lo devuelve · rechaza fecha pasada | RF-4, RF-3.4 |
| Unitario `unlock-code-cipher.spec.ts` | ida y vuelta · IV aleatorio · texto manipulado · clave débil | RF-4.2 |
| e2e | IMEI inválido rechazado · IMEI formateado se guarda normalizado · el código nunca vuelve en claro | RF-1, RF-4.3 |
| Unitario `spec-rules` + e2e `spec-coverage` | una sola transacción; un IMEI en conflicto no deja ningún cliente nuevo | RF-2.2 |
| e2e `spec-coverage` | el equipo cambia de dueño y conserva sus dos órdenes | RF-6.3 |
