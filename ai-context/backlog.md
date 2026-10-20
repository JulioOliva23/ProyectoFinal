# Backlog — `servicio_front`

Historias de usuario priorizadas para construir el frontend sobre la API ya implementada en `servicio_back`. Reglas técnicas en [constitution/frontend.md](constitution/frontend.md); supuestos en [supuestos.md](supuestos.md).

Prioridad: **P1** (MVP: sin esto no se puede operar), **P2** (completa el flujo), **P3** (mejora). El orden de la tabla es el orden sugerido de construcción.

Las historias funcionales completas (backend + frontend, con criterios Gherkin y estado de implementación) están en [backlog/](backlog/), agrupadas por épica. Equivalencias: US-F01 → US-00 · US-F02 → US-03 · US-F03 → US-01, US-02 · US-F04 → US-04, US-05, US-06, US-19, US-20 · US-F05 → US-09 · US-F06 → US-10, US-11, US-12 · US-F07 → US-15 · US-F08 → US-07 · US-F09 → US-08 · US-F10 → US-17, US-18 · US-F11 → US-13 · US-F12 → US-14 · US-F13 → US-16 · US-F14 → US-21 · US-F15 → US-12.

| ID | Historia | Prioridad | Rol | Endpoints | Depende de |
| --- | --- | --- | --- | --- | --- |
| US-F00 | Base del proyecto | P1 | — | `/api-json` | — |
| US-F01 | Inicio de sesión y sesión por rol | P1 | Todos | `/auth/*` | US-F00 |
| US-F02 | Listado de órdenes | P1 | Admin, Recepción, Técnico | `GET /work-orders` | US-F01 |
| US-F03 | Recepción del equipo (alta de OT) | P1 | Admin, Recepción | `POST /work-orders`, `GET /devices/by-imei/:imei`, `GET /device-models` | US-F01 |
| US-F04 | Detalle de OT, asignación y transiciones | P1 | Admin, Recepción, Técnico | `GET /work-orders/:id`, `/assign-technician`, `/transitions`, `/diagnosis`, `GET /users?role=TECHNICIAN` | US-F02 |
| US-F05 | Editor de presupuesto | P1 | Admin, Recepción | `POST/GET /work-orders/:id/budgets`, `GET /spare-parts?deviceModelId=` | US-F04 |
| US-F06 | Envío y decisión del presupuesto | P1 | Admin, Recepción | `/budgets/:id/send\|approve\|reject` | US-F05 |
| US-F07 | Inicio de reparación con Stock Guard | P1 | Técnico, Admin | `POST /work-orders/:id/transitions` | US-F04, US-F06 |
| US-F08 | Revelado auditado del código de desbloqueo | P1 | Técnico asignado, Admin | `POST /work-orders/:id/unlock-code/reveal` | US-F04 |
| US-F09 | Historial de auditoría de la OT | P2 | Admin, Recepción, Técnico | `GET /work-orders/:id/audit` | US-F04 |
| US-F10 | Portal del cliente (cuenta y código de seguimiento) | P2 | Cliente / público | `GET /work-orders/mine`, `POST /public/tracking` | US-F01 |
| US-F11 | Catálogo de inventario | P2 | Admin, Recepción | `GET/POST/PATCH/DELETE /spare-parts` | US-F01 |
| US-F12 | Ingresos y ajustes de stock | P2 | Admin (ajustes), Recepción (ingresos) | `/spare-parts/:id/stock-entries`, `/adjustments` | US-F11 |
| US-F13 | Alertas de stock bajo | P2 | Admin, Recepción | `GET /spare-parts/alerts/low-stock` | US-F11 |
| US-F14 | Gestión de usuarios y modelos | P3 | Admin | `/users`, `/device-models` | US-F01 |
| US-F15 | Badge de presupuestos por vencer | P3 | Admin, Recepción | `GET /work-orders/:id/budgets` | US-F06 |

---

## P1 — MVP

### US-F00 · Base del proyecto
Como equipo, quiero `servicio_front` creado a partir de `taller_front`, para reutilizar layout, cliente HTTP y componentes compartidos.

- Copiar `taller_front` a `servicio_front`, eliminar las features fuera del MVP (FE-05) y regenerar `schema.gen.ts` desde `/api-json`.
- Reemplazar `shared/types/statuses.ts` por los 9 estados con sus etiquetas en español.
- Agregar `shared/lib/imei.ts` (copia de la versión del backend) con los mismos tests.
- `npm run lint`, `typecheck` y `test` pasan; el pre-commit lo detecta como paquete.

### US-F01 · Inicio de sesión y sesión por rol
Como usuario interno o cliente, quiero iniciar sesión y llegar a mi pantalla, para trabajar solo con lo que me corresponde.

```gherkin
Escenario: Redirección por rol
  Dado un usuario con rol TECHNICIAN
  Cuando inicia sesión con credenciales válidas
  Entonces llega a "/ordenes" y no ve los enlaces "Presupuestos" ni "Inventario"

Escenario: Cliente
  Dado un usuario con rol CUSTOMER
  Cuando inicia sesión
  Entonces llega a "/portal-cliente"

Escenario: Sesión expirada
  Dado un access token vencido y un refresh token válido
  Cuando la UI hace una petición
  Entonces se renueva el token una sola vez y la petición se reintenta
```

### US-F02 · Listado de órdenes
Como recepcionista, quiero ver las OTs filtradas por estado y técnico, para organizar el trabajo del día.

```gherkin
Escenario: El técnico ve solo sus órdenes (RN-06)
  Dado un técnico con 2 OTs asignadas y otras 5 de otros técnicos
  Cuando abre "/ordenes"
  Entonces ve exactamente 2 OTs y no ve el filtro por técnico
```

- Paginación `{ data, total, page, pageSize }`; estados de carga, vacío y error (FE-18).

### US-F03 · Recepción del equipo
Como recepcionista, quiero registrar el equipo y abrir la OT en una sola pantalla, para no perder datos en el mostrador.

```gherkin
Escenario: IMEI inválido (RN-02)
  Cuando escribo el IMEI "352099001761482"
  Entonces veo "IMEI inválido: dígito verificador incorrecto" junto al campo
  Y el botón "Registrar" está deshabilitado

Escenario: Equipo con historial (RN-13)
  Cuando escribo un IMEI válido ya registrado
  Entonces, tras el debounce, se despliega el historial de reparaciones previas

Escenario: Código de desbloqueo (RN-03)
  Dado que elijo el tipo de bloqueo "Patrón"
  Entonces se muestra una grilla 3x3 y el código no aparece en texto plano
  Y si elijo "Sin bloqueo", el campo desaparece
```

- Check-in cosmético por zonas (pantalla, tapa, marco, lente, botones) con las condiciones `OK / Rayado / Fisurado / Abollado / Faltante`.
- Batería opcional (equipo que no enciende); fecha compromiso futura.
- Al terminar, muestra el número `OT-000123` y el **código de seguimiento** (`trackingCode`, solo esta vez) listos para imprimir en el ticket (SUP-05).

### US-F04 · Detalle de OT, asignación y transiciones
Como técnico, quiero avanzar el estado de mis OTs con un toque, para reflejar el trabajo real.

```gherkin
Escenario: Acciones según el backend (FE-08)
  Dado una OT en estado "Aprobado" asignada a mí
  Entonces el único botón de avance es "Iniciar reparación"

Escenario: Transición concurrente (RN-04)
  Cuando otra persona ya cambió el estado
  Entonces veo "La orden cambió, se actualizó la vista" y la OT se recarga
```

- Recepción/Admin asignan técnico (lista de técnicos activos). El técnico registra el diagnóstico en `IN_DIAGNOSIS`.
- Stepper de los 9 estados reutilizando `StatusPipeline`.

### US-F05 · Editor de presupuesto
Como recepcionista, quiero armar el presupuesto con mano de obra y repuestos compatibles, para cotizar sin errores.

```gherkin
Escenario: Solo repuestos compatibles (RN-10)
  Dado una OT de un "iPhone 13"
  Cuando busco repuestos para el presupuesto
  Entonces solo aparecen los compatibles con "iPhone 13"

Escenario: Totales (RN-15)
  Cuando agrego "Micro-soldadura" por 150.00 y una pantalla de 980.00
  Entonces el total es 1130.00 BOB, calculado sin decimales flotantes
```

- El precio de los repuestos lo pone el catálogo (solo lectura); el de mano de obra lo escribe la recepción.

### US-F06 · Envío y decisión del presupuesto
Como recepcionista, quiero registrar la respuesta del cliente y el canal, para que la reparación solo empiece con aprobación (RN-05).

```gherkin
Escenario: Presupuesto vencido (RN-08)
  Dado un presupuesto enviado hace 8 días
  Cuando intento aprobarlo
  Entonces veo "Presupuesto vencido: emitir nueva versión" y la OT sigue "Presupuestado"

Escenario: Rechazo
  Cuando registro el rechazo con canal "WhatsApp" y un motivo
  Entonces la OT pasa a "Cancelado" y aparece en la auditoría
```

### US-F07 · Inicio de reparación con Stock Guard
Como técnico, quiero saber de inmediato si faltan repuestos al iniciar la reparación, para no desarmar un equipo que no puedo terminar.

```gherkin
Escenario: Falta de stock (RN-09)
  Dado una OT aprobada con una pantalla sin stock disponible
  Cuando pulso "Iniciar reparación"
  Entonces veo un banner con la pantalla faltante
  Y la OT sigue en "Aprobado"
```

- El panel de repuestos de la OT muestra `Pendiente / Reservado / Consumido`, sin precios (RN-07).

### US-F08 · Revelado auditado del código de desbloqueo
Como técnico asignado, quiero ver el código de desbloqueo solo cuando lo necesito, sabiendo que queda registrado.

```gherkin
Escenario: Enmascarado por defecto (RN-03)
  Dado una OT con código PIN
  Entonces veo "••••" y el botón "Revelar código"

Escenario: Revelado
  Cuando pulso "Revelar código" y confirmo el aviso de auditoría
  Entonces se llama a POST /work-orders/:id/unlock-code/reveal
  Y el código se muestra por 30 segundos y luego se oculta solo

Escenario: Recepción no puede revelar
  Dado un usuario RECEPTIONIST
  Entonces no ve el botón "Revelar código"
```

## P2 — Flujo completo

### US-F09 · Historial de auditoría
Como administrador, quiero ver quién cambió cada estado y cuándo, para resolver reclamos (RN-12). Línea de tiempo de solo lectura, con el motivo cuando existe.

### US-F10 · Portal del cliente
Como cliente, quiero consultar el estado de mi equipo sin llamar al local (RN-14).

- Muestra número de OT, dispositivo, estado en español con stepper, fecha compromiso y total del presupuesto vigente. Nada técnico ni sensible.
- Dos modos (SUP-05): con sesión `CUSTOMER` (lista de OTs) o sin cuenta con número de OT + código de seguimiento.

```gherkin
Escenario: Consulta sin cuenta
  Dado el ticket de la OT "OT-000123" con código "K7QM-3XPA"
  Cuando ingreso "123" y "k7qm3xpa" en /portal-cliente
  Entonces veo el estado "En Reparación" y el total del presupuesto

Escenario: Datos incorrectos
  Cuando ingreso un código incorrecto
  Entonces veo "No encontramos una orden con esos datos"
  Y el mensaje es el mismo que para un número de OT inexistente

Escenario: Demasiados intentos
  Cuando fallo 5 veces en un minuto
  Entonces veo "Demasiados intentos, espere un minuto" y el botón se deshabilita
```

### US-F11 · Catálogo de inventario
Como administrador, quiero gestionar los repuestos electrónicos con su compatibilidad, para presupuestar correctamente. Filtros por categoría, modelo y texto. El costo unitario solo lo ve ADMIN.

### US-F12 · Ingresos y ajustes de stock
Como recepcionista, quiero registrar la llegada de repuestos. Como administrador, quiero ajustar mermas con motivo. Un ajuste mayor al stock disponible muestra el error `422` junto al campo.

### US-F13 · Alertas de stock bajo
Como recepcionista, quiero ver los repuestos en el mínimo o por debajo, para reponer a tiempo (RN-11). Se muestran como badge en el menú y como lista, sin modales.

## P3 — Mejoras

### US-F14 · Gestión de usuarios y modelos
El administrador crea usuarios por rol (los `CUSTOMER` vinculados a un cliente), los desactiva y da de alta modelos comerciales.

### US-F15 · Presupuestos por vencer
Badge "Vence en N días" o "Vencido" en el listado y el detalle de la OT, calculado a partir de `expiresAt` (SUP-04).
