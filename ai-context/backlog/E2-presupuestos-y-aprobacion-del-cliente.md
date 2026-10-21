# E2 — Presupuestos y aprobación del cliente

## Objetivo

Que ninguna reparación empiece sin un presupuesto aprobado por escrito: armarlo con mano de obra y repuestos compatibles con el modelo del equipo, enviarlo con una fecha de vencimiento, y registrar quién aprobó o rechazó, cuándo y por qué canal.

## Origen

Dificultad D4 de [00-contexto-problema.md](../00-contexto-problema.md) y reglas RN-05, RN-07, RN-08, RN-10 y RN-15.

## Historias de usuario

| ID | Título | Prioridad | Puntos | Rol | Depende de | Front |
| --- | --- | --- | --- | --- | --- | --- |
| US-09 | Armar presupuesto versionado | Must | 5 | Recepcionista, Administrador | US-05 | US-F05 |
| US-10 | Enviar presupuesto al cliente | Must | 2 | Recepcionista, Administrador | US-09 | US-F06 |
| US-11 | Registrar aprobación o rechazo del cliente | Must | 3 | Recepcionista, Administrador | US-10 | US-F06 |
| US-12 | Controlar el vencimiento del presupuesto | Should | 2 | Recepcionista, Administrador | US-10 | US-F06, US-F15 |

## Trazabilidad

- **Reglas de negocio:** RN-05, RN-07, RN-08, RN-10, RN-15 en [AI_CONTEXT.md §4](../../AI_CONTEXT.md#4-reglas-de-negocio-rn).
- **Supuestos:** SUP-04, SUP-10 en [supuestos.md](../supuestos.md).
- **Preguntas abiertas:** P-08, P-12, P-13, P-17, P-19, P-21 en [preguntas-cliente.md](../preguntas-cliente.md).

### Ciclo del presupuesto

```text
DRAFT ─send─▶ SENT ─approve─▶ APPROVED      (OT → APPROVED)
               │
               ├─reject─▶ REJECTED          (OT → CANCELLED)
               ├─vencido al decidir─▶ EXPIRED
               └─se envía otra versión─▶ SUPERSEDED
```

## US-09: Armar presupuesto versionado

**Como** Recepcionista, **quiero** armar el presupuesto con mano de obra y repuestos compatibles con el modelo del equipo, **para** cotizar sin errores.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 5 | Recepcionista, Administrador | US-05 |

### Criterios de aceptación

```gherkin
Escenario: Solo repuestos compatibles (RN-10)
  Dado una OT de un "iPhone 13"
  Cuando busco repuestos para el presupuesto
  Entonces solo aparecen los compatibles con "iPhone 13"
  Y si envío al backend un repuesto incompatible o inactivo, responde 422

Escenario: Precio de los repuestos
  Cuando agrego un repuesto
  Entonces su precio unitario lo pone el catálogo (precio taller) y no se puede editar
  Y el precio de la mano de obra lo escribe la recepción

Escenario: Totales exactos (RN-15)
  Cuando agrego "Micro-soldadura" por 150.00 y una pantalla de 980.00
  Entonces el total es 1130.00 BOB, calculado con Decimal y no con punto flotante

Escenario: Estado de la OT
  Dado una OT que no está "En Diagnóstico" ni "Presupuestado"
  Cuando intento crear un presupuesto
  Entonces el backend responde 409

Escenario: Nueva versión
  Dado una OT que ya tiene un presupuesto
  Cuando creo otro
  Entonces se guarda como una nueva versión en estado "Borrador"

Escenario: El técnico no ve presupuestos (RN-07)
  Dado un usuario TECHNICIAN
  Entonces no ve la sección "Presupuestos" y el backend responde 403
```

### Implementación

- **Backend:** `POST/GET /work-orders/:workOrderId/budgets`, `GET /budgets/:id` en `modules/budgets`. Precios de repuestos con `SparePartsService.priceCompatibleParts`; subtotales con `Prisma.Decimal`. Ítems `LABOR` y `PART`.
- **Frontend:** `features/budgets` (`BudgetsPage`, `BudgetEditorPage`, `BudgetBuilder`, `BudgetVersionCard`), `shared/lib/money.ts`.
- **Estado:** back ✅ · front ✅.

## US-10: Enviar presupuesto al cliente

**Como** Recepcionista, **quiero** marcar el presupuesto como enviado, **para** que empiece a correr su vigencia y la OT quede "Presupuestado".

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 2 | Recepcionista, Administrador | US-09 |

### Criterios de aceptación

```gherkin
Escenario: Envío de un borrador
  Dado un presupuesto en "Borrador" de una OT "En Diagnóstico"
  Cuando lo envío
  Entonces pasa a "Enviado" con expiresAt = ahora + BUDGET_VALIDITY_DAYS
  Y la OT pasa a "Presupuestado" en la misma transacción

Escenario: Reemplazo de versiones
  Dado una OT con una versión anterior enviada
  Cuando envío una versión nueva
  Entonces la anterior queda "Reemplazado" (SUPERSEDED) y no se borra

Escenario: Solo borradores
  Cuando intento enviar un presupuesto que no está en "Borrador"
  Entonces el backend responde 409
```

### Implementación

- **Backend:** `POST /budgets/:id/send`; `supersedeOthers` y `WorkOrderTransitionService.transitionWithin` dentro de la misma transacción.
- **Estado:** back ✅ · front ✅.

## US-11: Registrar aprobación o rechazo del cliente

**Como** Recepcionista, **quiero** registrar la respuesta del cliente con el canal por el que llegó, **para** que la reparación solo empiece con aprobación explícita.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 3 | Recepcionista, Administrador | US-10 |

### Criterios de aceptación

```gherkin
Escenario: Aprobación (RN-05)
  Dado un presupuesto "Enviado" y vigente
  Cuando registro la aprobación con canal "WhatsApp"
  Entonces el presupuesto queda "Aprobado" con usuario, fecha y canal
  Y la OT pasa a "Aprobado" en la misma transacción

Escenario: Rechazo
  Cuando registro el rechazo con canal "Teléfono" y un motivo
  Entonces el presupuesto queda "Rechazado"
  Y la OT pasa a "Cancelado" con el motivo en la auditoría

Escenario: Canales admitidos
  Entonces los canales son "En persona", "Teléfono", "WhatsApp" y "Correo"

Escenario: Decisión duplicada
  Cuando dos personas registran la decisión al mismo tiempo
  Entonces solo una se guarda y la otra recibe 409
```

### Implementación

- **Backend:** `POST /budgets/:id/approve` y `/reject` con `DecisionChannel` (`IN_PERSON`, `PHONE`, `WHATSAPP`, `EMAIL`); cambio de estado condicionado (`changeStatus` desde `SENT`).
- **Frontend:** `BudgetDecisionModal`.
- **Estado:** back ✅ · front ✅.

## US-12: Controlar el vencimiento del presupuesto

**Como** Recepcionista, **quiero** ver cuántos días le quedan a un presupuesto y no poder aprobar uno vencido, **para** no comprometer precios que cambiaron.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Should | 2 | Recepcionista, Administrador | US-10 |

### Criterios de aceptación

```gherkin
Escenario: Presupuesto vencido (RN-08)
  Dado un presupuesto enviado hace 8 días
  Cuando intento aprobarlo
  Entonces el backend lo marca "Expirado" (EXPIRED) y responde 422
  Y la interfaz muestra "Presupuesto vencido: emita una nueva versión para que el cliente la apruebe."
  Y la OT sigue "Presupuestado"

Escenario: Aviso de vencimiento (SUP-04)
  Dado un presupuesto enviado y vigente
  Entonces la interfaz muestra "Vence en N día(s)", calculado a partir de expiresAt
```

### Implementación

- **Backend:** `BudgetsService.requireDecidable`; `BUDGET_VALIDITY_DAYS` (7 por defecto). No hay job que marque vencidos por su cuenta (SUP-04).
- **Frontend:** `BudgetStatusBadge`, `BudgetVersionCard`.
- **Estado:** back ✅ · front ✅.
