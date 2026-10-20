# E1 — Recepción, asignación y ciclo de la orden de trabajo

## Objetivo

Formalizar el ingreso de cada celular con su estado físico, su IMEI validado y su código de desbloqueo protegido; distribuir el trabajo entre técnicos y hacer que la orden de trabajo (OT) recorra estados claros y auditables, con el acceso de cada rol limitado a lo que le corresponde.

## Origen

Dificultades D1, D2, D3 y D6 de [00-contexto-problema.md](../00-contexto-problema.md) y reglas RN-01, RN-02, RN-03, RN-04, RN-06, RN-12 y RN-13.

## Historias de usuario

| ID | Título | Prioridad | Puntos | Rol | Depende de | Front |
| --- | --- | --- | --- | --- | --- | --- |
| US-00 | Autenticación, control de acceso y navegación por roles | Must | 3 | Todos | — | US-F01 |
| US-01 | Registrar ingreso del equipo (check-in) | Must | 5 | Recepcionista, Administrador | US-00 | US-F03 |
| US-02 | Consultar historial del equipo por IMEI | Must | 2 | Recepcionista, Técnico, Administrador | US-01 | US-F03 |
| US-03 | Listar órdenes de trabajo | Must | 3 | Recepcionista, Técnico, Administrador | US-00 | US-F02 |
| US-04 | Asignar técnico a la OT | Must | 2 | Recepcionista, Administrador | US-01 | US-F04 |
| US-05 | Registrar diagnóstico preliminar | Must | 2 | Técnico, Administrador | US-04 | US-F04 |
| US-06 | Avanzar el estado de la OT | Must | 5 | Recepcionista, Técnico, Administrador | US-04 | US-F04 |
| US-07 | Revelar el código de desbloqueo con auditoría | Must | 3 | Técnico asignado, Administrador | US-01 | US-F08 |
| US-08 | Consultar la auditoría de estados de la OT | Should | 2 | Recepcionista, Técnico, Administrador | US-06 | US-F09 |
| US-21 | Gestionar usuarios y modelos comerciales | Could | 3 | Administrador | US-00 | US-F14 |

## Trazabilidad

- **Contexto de origen:** [00-contexto-problema.md](../00-contexto-problema.md)
- **Reglas de negocio:** [AI_CONTEXT.md §4](../../AI_CONTEXT.md#4-reglas-de-negocio-rn) y máquina de estados en [§5](../../AI_CONTEXT.md#5-máquina-de-estados-de-la-ot).
- **Reglas técnicas:** [constitution/backend.md](../constitution/backend.md), [constitution/frontend.md](../constitution/frontend.md) y [constitution/tools.md](../constitution/tools.md).
- **Supuestos:** SUP-01, SUP-03, SUP-06, SUP-07, SUP-09 en [supuestos.md](../supuestos.md).
- **Preguntas abiertas:** P-02 a P-07, P-15, P-16 en [preguntas-cliente.md](../preguntas-cliente.md).

## US-00: Autenticación, control de acceso y navegación por roles

**Como** usuario del servicio técnico (Recepcionista, Técnico, Administrador o Cliente), **quiero** iniciar sesión con mis credenciales y llegar a mi pantalla, **para** trabajar solo con los módulos y datos que mi rol permite.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 3 | Todos | — |

### Criterios de aceptación

```gherkin
Escenario: Inicio de sesión y redirección por rol
  Dado que el usuario está en "/auth/login"
  Cuando ingresa usuario y contraseña válidos
  Entonces el sistema emite un access token y un refresh token
  Y lo redirige a su pantalla inicial:
    | Rol          | Pantalla inicial |
    | ADMIN        | /ordenes         |
    | RECEPTIONIST | /ordenes         |
    | TECHNICIAN   | /ordenes         |
    | CUSTOMER     | /portal-cliente  |

Escenario: Credenciales inválidas
  Cuando ingresa una contraseña incorrecta o un usuario inactivo
  Entonces el backend responde 401
  Y la pantalla muestra "Credenciales incorrectas"

Escenario: Navegación restringida en la interfaz (RN-07)
  Dado un usuario con rol TECHNICIAN
  Cuando intenta entrar por URL a "/presupuestos" o "/inventario"
  Entonces el router lo redirige a "/ordenes"
  Y el menú no muestra "Presupuestos" ni "Inventario"

Escenario: Autorización en el backend
  Dado un usuario con rol TECHNICIAN
  Cuando envía directamente POST /api/v1/budgets/:id/approve
  Entonces el RolesGuard responde 403 y no se modifica nada

Escenario: Sesión expirada
  Dado un access token vencido y un refresh token válido
  Cuando la interfaz hace una petición
  Entonces se renueva el token una sola vez y la petición se reintenta

Escenario: Rotación y reuso del refresh token
  Dado un refresh token que ya fue rotado
  Cuando alguien lo usa de nuevo en POST /api/v1/auth/refresh
  Entonces se revoca toda la familia de tokens del usuario y se responde 401

Escenario: Cierre de sesión
  Cuando el usuario cierra sesión
  Entonces se llama a POST /api/v1/auth/logout, el refresh token entra a la denylist
  Y el cliente borra los tokens y vuelve a "/auth/login"

Escenario: Límite de intentos
  Cuando se superan 10 intentos de login por minuto desde la misma IP
  Entonces el backend responde 429
```

### Implementación

- **Backend:** `modules/auth` (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/profile`), `modules/users`, `common/guards` (`JwtAuthGuard` y `RolesGuard` globales, `@Public()`, `@Roles()`), denylist `revoked_refresh_tokens`, contraseñas con argon2.
- **Frontend:** `features/auth` (`LoginPage`, `AuthProvider`, `ProtectedRoute`, `role-routes.ts`), `shared/api/httpClient.ts` (token en memoria, refresh único ante 401).
- **Estado:** back ✅ · front ✅. Refresh token en `sessionStorage` según SUP-07.

## US-01: Registrar ingreso del equipo (check-in)

**Como** Recepcionista, **quiero** registrar el equipo, su estado físico y la falla reportada en una sola pantalla, **para** abrir la OT sin perder datos en el mostrador y dejar constancia del estado en que se recibió.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 5 | Recepcionista, Administrador | US-00 |

### Criterios de aceptación

```gherkin
Escenario: Alta exitosa de la OT (RN-01)
  Dado que la recepcionista completa cliente, modelo, IMEI válido, problema reportado y check-in cosmético
  Cuando pulsa "Registrar"
  Entonces se crea la OT en estado "Ingresado"
  Y se muestra el número "OT-000123" y el código de seguimiento para imprimir en el ticket

Escenario: IMEI inválido (RN-02)
  Cuando escribe el IMEI "352099001761482"
  Entonces ve "IMEI inválido: el dígito verificador no coincide" junto al campo
  Y no puede registrar la OT

Escenario: IMEI ya registrado con otro modelo (SUP-06)
  Dado un IMEI existente asociado a otro modelo
  Cuando intenta registrar la OT
  Entonces el backend responde 409

Escenario: Código de desbloqueo protegido (RN-03)
  Dado que elige el tipo de bloqueo "Patrón"
  Entonces se muestra una grilla 3x3 y el código no aparece en texto plano
  Y el backend lo guarda solo cifrado con AES-256-GCM
  Y si elige "Sin bloqueo", el campo desaparece

Escenario: Check-in cosmético
  Entonces cada zona (pantalla, tapa, marco, lente, botones) admite "OK", "Rayado", "Fisurado", "Abollado" o "Faltante"
  Y la batería es opcional, entre 0 y 100 %, para equipos que no encienden

Escenario: Fecha compromiso
  Cuando la fecha compromiso está en el pasado
  Entonces el backend responde 422 "promisedAt must be in the future"
```

### Implementación

- **Backend:** `POST /work-orders` en `modules/work-orders`; crea o reutiliza `Device` por IMEI (`modules/devices`), cifra con `common/crypto` (`UnlockCodeCipher`), genera el código de seguimiento (`domain/work-orders/tracking-code.ts`) y lo devuelve una sola vez. IMEI: `domain/devices/imei.ts`, `@IsImei()`.
- **Frontend:** `features/work-orders/pages/CheckInPage.tsx`, `CosmeticChecklist`, `PatternGrid`, `UnlockCodeField`, `IntakeTicket`, `shared/lib/imei.ts`.
- **Estado:** back ✅ · front ✅.

## US-02: Consultar historial del equipo por IMEI

**Como** Recepcionista, **quiero** que al escribir un IMEI ya registrado aparezcan sus reparaciones anteriores, **para** saber qué se le hizo antes sin buscarlo a mano.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 2 | Recepcionista, Técnico, Administrador | US-01 |

### Criterios de aceptación

```gherkin
Escenario: Equipo con historial (RN-13)
  Dado un IMEI válido que ya tiene OTs anteriores
  Cuando la recepcionista lo escribe en el check-in
  Entonces, tras el debounce, se despliega el historial con número de OT, fecha, problema y estado

Escenario: Equipo nuevo
  Dado un IMEI válido sin registros
  Entonces no se muestra historial y el alta continúa normalmente

Escenario: Reventa del equipo (SUP-06)
  Dado un IMEI registrado a nombre de otro cliente
  Cuando se registra una nueva OT para un cliente distinto
  Entonces el dispositivo pasa al nuevo cliente y conserva su historial
```

### Implementación

- **Backend:** `GET /devices/by-imei/:imei` con `ParseImeiPipe`.
- **Frontend:** `DeviceHistoryPanel` en el check-in.
- **Estado:** back ✅ · front ✅.

## US-03: Listar órdenes de trabajo

**Como** Recepcionista, **quiero** ver las OTs filtradas por estado y técnico, **para** organizar el trabajo del día. **Como** Técnico, **quiero** ver solo las mías.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 3 | Recepcionista, Técnico, Administrador | US-00 |

### Criterios de aceptación

```gherkin
Escenario: El técnico ve solo sus órdenes (RN-06)
  Dado un técnico con 2 OTs asignadas y otras 5 de otros técnicos
  Cuando abre "/ordenes"
  Entonces ve exactamente 2 OTs y no ve el filtro por técnico

Escenario: Filtro por estado
  Cuando la recepcionista selecciona el chip "En Reparación"
  Entonces solo ve las OTs en ese estado

Escenario: Paginación y estados de la vista
  Entonces el listado se pagina con { data, total, page, pageSize }
  Y muestra estados de carga, vacío y error
```

### Implementación

- **Backend:** `GET /work-orders` paginado; el repositorio filtra por `technicianId` cuando el rol es `TECHNICIAN`.
- **Frontend:** `WorkOrdersPage`, `WorkOrdersTable`, `WorkOrdersBoard`, `StatusFilterChips`, `Pagination`.
- **Estado:** back ✅ · front ✅.

## US-04: Asignar técnico a la OT

**Como** Recepcionista, **quiero** asignar un técnico activo a la OT, **para** distribuir el trabajo.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 2 | Recepcionista, Administrador | US-01 |

### Criterios de aceptación

```gherkin
Escenario: Asignación exitosa
  Dado una OT en "Ingresado"
  Cuando la recepcionista elige un técnico de la lista de técnicos activos
  Entonces la OT queda asignada y aparece en el listado de ese técnico

Escenario: Asignación tardía (RN-06)
  Dado una OT que ya está "En Reparación"
  Cuando se intenta cambiar el técnico
  Entonces el backend responde 409 "technician can only be assigned before the repair starts"

Escenario: Rol sin permiso
  Dado un usuario TECHNICIAN
  Cuando llama a POST /work-orders/:id/assign-technician
  Entonces recibe 403
```

### Implementación

- **Backend:** `POST /work-orders/:id/assign-technician`, `GET /users?role=TECHNICIAN`.
- **Frontend:** `AssignTechnicianPanel` en el detalle de la OT.
- **Estado:** back ✅ · front ✅.

## US-05: Registrar diagnóstico preliminar

**Como** Técnico, **quiero** registrar el diagnóstico mientras la OT está en diagnóstico, **para** que recepción pueda armar el presupuesto.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 2 | Técnico, Administrador | US-04 |

### Criterios de aceptación

```gherkin
Escenario: Diagnóstico en el estado correcto
  Dado una OT "En Diagnóstico" asignada a mí
  Cuando registro el diagnóstico preliminar
  Entonces queda guardado en la OT

Escenario: Diagnóstico fuera de estado
  Dado una OT en otro estado
  Cuando intento registrar el diagnóstico
  Entonces el backend responde 409

Escenario: OT ajena (RN-06)
  Dado una OT asignada a otro técnico
  Cuando intento registrar el diagnóstico
  Entonces recibo 403
```

### Implementación

- **Backend:** `PATCH /work-orders/:id/diagnosis` (`WorkOrder.preliminaryDiagnosis`).
- **Frontend:** `DiagnosisForm`.
- **Estado:** back ✅ · front ✅.

## US-06: Avanzar el estado de la OT

**Como** Técnico o Recepcionista, **quiero** avanzar el estado de la OT con un toque, **para** reflejar el trabajo real sin saltarme pasos.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 5 | Recepcionista, Técnico, Administrador | US-04 |

### Criterios de aceptación

```gherkin
Escenario: Solo las acciones permitidas (RN-04, FE-08)
  Dado una OT "Aprobado" asignada a mí como técnico
  Entonces el único botón de avance es "Iniciar reparación"

Escenario: Transición ilegal
  Cuando se envía una transición que no está en la máquina de estados
  Entonces el backend responde 409

Escenario: Rol no permitido
  Dado un RECEPTIONIST
  Cuando intenta pasar una OT de "Aprobado" a "En Reparación"
  Entonces recibe 403

Escenario: Precondiciones del flujo (RN-05)
  Dado una OT "Ingresado" sin técnico asignado
  Cuando se intenta pasar a "En Diagnóstico"
  Entonces la transición se rechaza

Escenario: Transición concurrente
  Cuando otra persona ya cambió el estado de la OT
  Entonces veo "La orden cambió mientras tanto" y la OT se recarga

Escenario: Auditoría (RN-12)
  Cuando una transición se completa
  Entonces se inserta una fila en work_order_status_audits en la misma transacción
```

### Transiciones permitidas

| Desde | Hacia | Roles |
| --- | --- | --- |
| `RECEIVED` | `IN_DIAGNOSIS` | Técnico, Admin |
| `RECEIVED` · `IN_DIAGNOSIS` · `BUDGETED` | `CANCELLED` | Recepción, Admin |
| `IN_DIAGNOSIS` | `BUDGETED` | Técnico, Recepción, Admin |
| `BUDGETED` | `APPROVED` | Recepción, Admin |
| `APPROVED` | `IN_REPAIR` | Técnico, Admin (Stock Guard, ver US-15) |
| `IN_REPAIR` | `QUALITY_CONTROL` | Técnico, Admin |
| `QUALITY_CONTROL` | `READY_FOR_DELIVERY` · `IN_REPAIR` (retrabajo) | Técnico, Admin |
| `READY_FOR_DELIVERY` · `CANCELLED` | `DELIVERED` | Recepción, Admin |

### Implementación

- **Backend:** `POST /work-orders/:id/transitions` → `WorkOrderTransitionService`; tabla única en `domain/work-orders/work-order-state-machine.ts`; hooks `WorkflowPreconditionsHook`, `InventoryStockGuardHook`, `AuditTrailHook`.
- **Frontend:** `TransitionActions`, `StatusTimeline`, `WorkOrderStatusBadge`.
- **Estado:** back ✅ · front ✅.

## US-07: Revelar el código de desbloqueo con auditoría

**Como** Técnico asignado, **quiero** ver el código de desbloqueo solo cuando lo necesito, **para** probar el equipo sabiendo que el acceso queda registrado.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Must | 3 | Técnico asignado, Administrador | US-01 |

### Criterios de aceptación

```gherkin
Escenario: Enmascarado por defecto (RN-03)
  Dado una OT con código PIN
  Entonces veo "••••" y el botón "Revelar código"

Escenario: Revelado auditado
  Cuando pulso "Revelar código" y confirmo el aviso de auditoría
  Entonces se llama a POST /work-orders/:id/unlock-code/reveal
  Y se registra el acceso en unlock_code_access_logs antes de devolver el código
  Y el código se muestra 30 segundos y luego se oculta solo

Escenario: Técnico no asignado
  Dado un técnico que no está asignado a la OT
  Cuando intenta revelar el código
  Entonces recibe 403

Escenario: Recepción no puede revelar
  Dado un usuario RECEPTIONIST
  Entonces no ve el botón "Revelar código" y el backend respondería 403

Escenario: Sin código
  Dado una OT con bloqueo "Sin bloqueo"
  Cuando se intenta revelar
  Entonces el backend responde 404
```

### Implementación

- **Backend:** `POST /work-orders/:id/unlock-code/reveal`, `UnlockCodeCipher` (AES-256-GCM, clave `UNLOCK_CODE_ENCRYPTION_KEY`), tabla append-only `unlock_code_access_logs`.
- **Frontend:** `UnlockCodeReveal`.
- **Estado:** back ✅ · front ✅. Pendiente la política de borrado al entregar (SUP-09, P-16).

## US-08: Consultar la auditoría de estados de la OT

**Como** Administrador, **quiero** ver quién cambió cada estado y cuándo, **para** resolver reclamos.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Should | 2 | Recepcionista, Técnico, Administrador | US-06 |

### Criterios de aceptación

```gherkin
Escenario: Línea de tiempo (RN-12)
  Dado una OT con varias transiciones
  Cuando abro su detalle
  Entonces veo cada cambio con fecha, usuario, estado anterior, estado nuevo y motivo

Escenario: Inmutabilidad (SUP-03)
  Cuando se intenta UPDATE o DELETE sobre work_order_status_audits
  Entonces el trigger de PostgreSQL rechaza la operación
```

### Implementación

- **Backend:** `GET /work-orders/:id/audit`, trigger `reject_mutation()` en `prisma/sql/immutable-audit.sql`.
- **Frontend:** `AuditTimeline`.
- **Estado:** back ✅ · front ✅.

## US-21: Gestionar usuarios y modelos comerciales

**Como** Administrador, **quiero** crear y desactivar usuarios por rol y dar de alta modelos comerciales, **para** mantener el sistema sin tocar la base de datos.

| Prioridad | Puntos | Rol | Depende de |
| --- | --- | --- | --- |
| Could | 3 | Administrador | US-00 |

### Criterios de aceptación

```gherkin
Escenario: Alta de usuario
  Cuando el administrador crea un usuario con rol TECHNICIAN
  Entonces aparece en la lista de técnicos asignables

Escenario: Usuario cliente (RN-14)
  Cuando crea un usuario con rol CUSTOMER vinculado a un cliente existente
  Entonces ese usuario ve en el portal solo las OTs de ese cliente
  Y si intenta vincular un cliente a un usuario de otro rol, el backend responde 422

Escenario: Desactivación
  Cuando desactiva un usuario
  Entonces se aplica borrado lógico y ya no puede iniciar sesión

Escenario: Modelo duplicado
  Cuando registra un modelo con marca y nombre ya existentes
  Entonces el backend responde 409
```

### Implementación

- **Backend:** `POST/GET/DELETE /users`, `POST /device-models` ✅.
- **Frontend:** ⏭ pendiente (no hay pantalla de administración).
