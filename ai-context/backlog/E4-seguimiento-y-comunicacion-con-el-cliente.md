# E4 — Seguimiento, comunicación con el cliente y entrega

## Objetivo

Que el cliente sepa en qué estado está su equipo sin llamar al local, con o sin cuenta, sin ver información interna ni sensible; y cerrar el ciclo de la OT con el control de calidad y la entrega registrada del equipo.

## Origen

Dificultad D1 de [00-contexto-problema.md](../00-contexto-problema.md) y reglas RN-03, RN-04, RN-07, RN-12 y RN-14. Decisión de acceso del cliente en SUP-05.

## Historias de usuario

| ID | Título | Prioridad | Puntos | Rol | Depende de | Front |
| --- | --- | --- | --- | --- | --- | --- |
| US-17 | Consultar mis equipos con cuenta de cliente | Must | 2 | Cliente (`CUSTOMER`) | US-00, US-01 | US-F10 |
| US-18 | Consultar el estado con número de OT y código de seguimiento | Must | 3 | Público | US-01 | US-F10 |
| US-19 | Regenerar el código de seguimiento | Should | 2 | Recepcionista, Administrador | US-18 | US-F04 |
| US-20 | Control de calidad y entrega del equipo | Must | 3 | Técnico, Recepcionista, Administrador | US-15 | US-F04 |

## Trazabilidad

- **Reglas de negocio:** RN-03, RN-04, RN-07, RN-12, RN-14 en [AI_CONTEXT.md §4](../../AI_CONTEXT.md#4-reglas-de-negocio-rn).
- **Supuestos:** SUP-05 (confirmado), SUP-08, SUP-09 en [supuestos.md](../supuestos.md).
- **Preguntas abiertas:** P-05, P-14, P-16, P-18 en [preguntas-cliente.md](../preguntas-cliente.md).

### Qué ve el cliente (RN-14)

Los dos modos devuelven exactamente `CustomerWorkOrderStatusDto`:

| Campo | Contenido |
| --- | --- |
| `number` | Número de la OT (`OT-000123`) |
| `status` / `statusLabel` | Estado y su etiqueta en español |
| `device` | Marca y modelo del equipo |
| `promisedAt` | Fecha compromiso |
| `budgetTotal` | Total del presupuesto vigente, si existe |
| `updatedAt` | Última actualización |

Nunca incluye costos internos, ítems del presupuesto, notas técnicas ni el código de desbloqueo.

## US-17: Consultar mis equipos con cuenta de cliente

**Como** Cliente con cuenta, **quiero** ver todas mis órdenes al iniciar sesión, **para** seguir mis reparaciones sin llamar.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 2 | Cliente (`CUSTOMER`) | US-00, US-01 |

### Criterios de aceptación

```gherkin
Escenario: Mis órdenes
  Dado un usuario CUSTOMER vinculado a un cliente con 2 OTs
  Cuando inicia sesión
  Entonces llega a "/portal-cliente" y ve sus 2 OTs con estado y stepper

Escenario: Cuenta sin cliente vinculado
  Dado un usuario CUSTOMER sin cliente vinculado
  Cuando consulta GET /work-orders/mine
  Entonces recibe 403

Escenario: Sin acceso a pantallas internas
  Dado un usuario CUSTOMER
  Cuando intenta entrar a "/ordenes"
  Entonces el router lo devuelve a "/portal-cliente"
```

### Implementación

- **Backend:** `GET /work-orders/mine` (rol `CUSTOMER`), filtrado por `User.customerId`.
- **Frontend:** `CustomerPortalPage`, `CustomerOrderStatus`.
- **Estado:** back ✅ · front ✅.

## US-18: Consultar el estado con número de OT y código de seguimiento

**Como** Cliente sin cuenta, **quiero** consultar mi equipo con los datos impresos en el ticket, **para** no tener que crear un usuario.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 3 | Público | US-01 |

### Criterios de aceptación

```gherkin
Escenario: Consulta sin cuenta (SUP-05)
  Dado el ticket de la OT "OT-000123" con código "K7QM-3XPA"
  Cuando ingreso "123" y "k7qm3xpa" en "/portal-cliente"
  Entonces veo el estado, la fecha compromiso y el total del presupuesto vigente

Escenario: Datos incorrectos
  Cuando ingreso un código incorrecto o un número de OT que no existe
  Entonces veo "No encontramos una orden con esos datos. Revise el número y el código de su ticket."
  Y el mensaje y el tiempo de respuesta son los mismos en ambos casos

Escenario: Demasiados intentos
  Cuando fallo 5 veces en un minuto desde la misma IP
  Entonces el backend responde 429
  Y veo "Demasiados intentos. Espere un minuto antes de volver a intentar."

Escenario: El código no es el PIN del equipo (RN-03)
  Entonces el código de seguimiento se genera al azar, se guarda solo como hash argon2
  Y se regenera si coincidiera con el código de desbloqueo
```

### Implementación

- **Backend:** `POST /public/tracking` (`@Public()`, `ThrottlerGuard` 5/min) en `PublicTrackingController`; `WorkOrdersService.trackPublicly`; verificación contra un hash ficticio cuando la OT no existe; `domain/work-orders/tracking-code.ts` (8 caracteres sin símbolos confundibles).
- **Frontend:** `features/customer-portal` (`TrackingForm`, `tracking-schema.ts`, `tracking-messages.ts`), `shared/lib/tracking-code.ts`. `/tracking` redirige a `/portal-cliente`.
- **Estado:** back ✅ · front ✅.

## US-19: Regenerar el código de seguimiento

**Como** Recepcionista, **quiero** emitir un código nuevo cuando el cliente perdió su ticket, **para** que pueda seguir consultando sin que el código anterior siga sirviendo.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Should | 2 | Recepcionista, Administrador | US-18 |

### Criterios de aceptación

```gherkin
Escenario: Ticket perdido
  Dado una OT con código de seguimiento
  Cuando la recepcionista confirma "Generar nuevo código"
  Entonces se muestra el código nuevo una sola vez para reimprimir el ticket
  Y el código anterior deja de funcionar en "/portal-cliente"

Escenario: OT anterior a la migración
  Dado una OT creada antes de que existiera el código de seguimiento
  Cuando la recepcionista lo regenera
  Entonces la OT queda habilitada para la consulta pública

Escenario: Rol sin permiso
  Dado un usuario TECHNICIAN
  Cuando llama a POST /work-orders/:id/tracking-code/regenerate
  Entonces recibe 403
```

### Implementación

- **Backend:** `POST /work-orders/:id/tracking-code/regenerate`.
- **Frontend:** `TrackingCodePanel` en el detalle de la OT.
- **Estado:** back ✅ · front ✅.

## US-20: Control de calidad y entrega del equipo

**Como** Técnico, **quiero** pasar el equipo por control de calidad y devolverlo a reparación si falla. **Como** Recepcionista, **quiero** registrar la entrega al cliente, también de los equipos cancelados, **para** cerrar la OT.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 3 | Técnico, Recepcionista, Administrador | US-15 |

### Criterios de aceptación

```gherkin
Escenario: Control de calidad aprobado
  Dado una OT "Control de Calidad"
  Cuando el técnico la marca lista
  Entonces pasa a "Listo para Entrega"

Escenario: Retrabajo
  Dado una OT "Control de Calidad" que no pasó la prueba
  Cuando el técnico la devuelve a reparación
  Entonces pasa a "En Reparación" sin volver a reservar ni consumir repuestos

Escenario: Entrega
  Dado una OT "Listo para Entrega"
  Cuando la recepcionista registra la entrega
  Entonces pasa a "Entregado" y queda en la auditoría (RN-12)

Escenario: Devolución de un equipo cancelado
  Dado una OT "Cancelado"
  Cuando el cliente retira su equipo
  Entonces la recepcionista la pasa a "Entregado"

Escenario: El técnico no entrega
  Dado un usuario TECHNICIAN
  Cuando intenta pasar una OT a "Entregado"
  Entonces recibe 403
```

### Implementación

- **Backend:** transiciones `QUALITY_CONTROL → READY_FOR_DELIVERY | IN_REPAIR`, `READY_FOR_DELIVERY → DELIVERED`, `CANCELLED → DELIVERED` en `work-order-state-machine.ts`.
- **Frontend:** `TransitionActions`.
- **Estado:** back ✅ · front ✅. Fuera del MVP: liquidación de la cuenta, cobro y garantía (P-12, P-14). Pendiente la política de borrado del código de desbloqueo al entregar (SUP-09, P-16).
