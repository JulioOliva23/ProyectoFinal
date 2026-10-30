# Verificación de las specs del backend

**Fecha:** 2026-10-29 · **Rama:** `main` (`af6a107`) · **Constitución:** [docs/constitution.md](../docs/constitution.md)

## 1. Qué se ejecutó

| Suite | Comando | Resultado |
| --- | --- | --- |
| Unitarias | `npx jest` | ✅ **16 suites, 165 tests, 0 fallos** |
| e2e (Supertest + PostgreSQL) | `npm run test:e2e` | ⏸ **No ejecutada**: Docker Desktop estaba cerrado y no hay base de datos de pruebas. Los tests e2e existen y se citan abajo, pero **no puedo afirmar que pasen hoy** |
| Reglas de la constitución | `grep` sobre el código | Ver sección 4 |

Leyenda: ✅ cubierto por un test que pasó · ⏸ cubierto solo por un e2e no ejecutado · ⚠️ implementado pero **sin test** · ❌ **incumple la spec** (aunque algún test pase) · — no aplica (spec propuesta).

## 2. Requisito por requisito

### Spec 001 · Autenticación y sesiones

| RF | Test que lo cubre | Resultado |
| --- | --- | --- |
| RF-1 Inicio de sesión (1.1, 1.2) | `auth.service`: "returns an access + refresh token pair…", "returns 401 for an unknown or inactive user without leaking which case", "returns 401 when the password is incorrect" | ✅ |
| RF-2.1 Renovación con rotación | `auth.service`: "rotates the used refresh token: revokes the old jti and mints a new pair" | ✅ |
| **RF-2.2 Reutilización invalida todas las sesiones** | `auth.service`: "revokes the whole user family and returns 401 when the refresh token was reused" | ❌ **El test pasa, el requisito no se cumple.** El test solo comprueba que se llamó a `deleteManyByUser`, que es un `DELETE` de la lista de denegación: elimina las marcas de revocación y deja de nuevo utilizables las credenciales ya rotadas (hallazgo H1) |
| RF-2.3 Credencial inválida o sin identificador | "returns 401 when a refresh token has no jti", "returns 401 for an invalid refresh token" | ✅ |
| RF-3 Cierre de sesión | 3 tests de logout (revoca, idempotente, 401) | ✅ |
| RF-4 Efecto de cambios administrativos | "rejects a refresh token minted before the last admin change…", "accepts… even within the same second" | ✅ |
| RF-5 Perfil sin secretos | "returns the profile of an active user without the hash" | ✅ |
| RF-6 Límite de 10 intentos de login | — | ⚠️ implementado (`@Throttle` en el controller), sin test |
| RF-7 Acceso por rol | e2e "rejects unauthenticated requests", "forbids a technician from creating spare parts" | ⏸ |

**Veredicto 001: ❌ No cumplida del todo.** RF-2.2 incumplido (H1); RF-6 sin test; RNF-3 con una fuga por tiempo (H2).

### Spec 002 · Gestión de usuarios

| RF | Test | Resultado |
| --- | --- | --- |
| RF-1.1 Alta y contraseña no devuelta | "hashes the password with argon2 and never returns it (BE-28)" | ✅ |
| RF-1.2, RF-1.3 Reglas de usuario y contraseña | — (validación en el DTO) | ⚠️ |
| RF-1.4 Usuario duplicado | "rejects a duplicated username" | ✅ |
| RF-1.5 Cliente vinculado debe existir | — | ⚠️ |
| RF-1.6 Personal no se vincula a cliente | "rejects binding a staff user to a customer (RN-14)" | ✅ |
| RF-2.1 Listado con filtro por rol | — (solo se prueba la parte de inactivos) | ⚠️ |
| RF-2.2 Inactivos solo para el administrador | "includes inactive users only for ADMIN" | ✅ |
| RF-3.1–3.4 Edición | 5 tests: editar nombre/rol, personal↔cliente, rol propio, renombrarse, 404 | ✅ |
| RF-4.1 Reinicio de contraseña | "stores only the new argon2 hash" | ✅ |
| RF-4.2 Reinicio invalida sesiones previas | Cubierto indirectamente por RF-4 de la spec 001 | ✅ (indirecto) |
| RF-5.1–5.4 Desactivar y reactivar | 4 tests: desactiva, no a sí mismo, 404 si ya inactiva, reactiva e idempotente | ✅ |
| RF-6.1 Técnico asignable | "only accepts active technicians as assignees (RN-06)" | ✅ |

**Veredicto 002: ⚠️ Cumplida en lo funcional, con huecos de prueba** (RF-1.2, 1.3, 1.5, 2.1). **RNF-3 incumplido:** los mensajes de este módulo están en inglés (H4).

### Spec 003 · Recepción del equipo y dispositivos

| RF | Test | Resultado |
| --- | --- | --- |
| RF-1 IMEI válido (Luhn, normalización, rechazo) | `imei.spec` (4 tests), `device-check-in.dto.spec` ("normalizes…", "rejects an IMEI with a wrong check digit", "propagates the nested IMEI Luhn error"); e2e Luhn y formato | ✅ (e2e ⏸) |
| RF-2.1 Apertura de la orden | e2e "delivers the device…" (flujo completo) | ⏸ |
| RF-2.2 Atomicidad del ingreso | — | ⚠️ |
| RF-2.3 Recepcionista tomado de la sesión | — | ⚠️ |
| RF-3.1–3.5 Datos de la orden | `device-check-in.dto.spec`: ingreso completo, batería fuera de 0–100, condición desconocida, campos extra; `work-orders.service`: "rejects a promised date in the past" | ✅ |
| RF-3.6 Datos del cliente (documento, nombre, teléfono, correo) | — | ⚠️ |
| RF-4.1 Código obligatorio según el bloqueo | "requires an unlock code for protected devices", "accepts a pattern and a device without lock" | ✅ |
| RF-4.2 Código solo cifrado | `unlock-code-cipher.spec` (4 tests); "encrypts the unlock code before persisting it and never returns it (RN-03)" | ✅ |
| RF-4.3 Código nunca devuelto | e2e "never stores or returns the unlock code in plaintext" | ⏸ |
| RF-5.1 Historial por IMEI | e2e (consulta con 200) | ⏸ |
| RF-5.2 IMEI no registrado → 404 | "returns 404 for an unregistered IMEI lookup" | ✅ |
| RF-6.1 Reutiliza el equipo | "reuses the device (and its history) when the IMEI is known (RN-13)" | ✅ |
| RF-6.2 Otro modelo → conflicto | "rejects a known IMEI declared with another model (RN-02)" | ✅ |
| RF-6.3 Transferencia por reventa | — | ⚠️ |
| RF-6.4 Modelo inexistente/inactivo | "rejects an unknown or inactive device model" | ✅ |
| RF-7.1–7.5 Catálogo de modelos | 6 tests de modelos (crear, duplicado sin mayúsculas, renombrar, cambio solo de mayúsculas, activar, 404, inactivos solo Admin) | ✅ |

**Veredicto 003: ⚠️ Cumplida con huecos** (RF-2.2, 2.3, 3.6, 6.3 sin test; varios dependen de e2e no ejecutado).

### Spec 004 · Ciclo de vida de la orden

| RF | Test | Resultado |
| --- | --- | --- |
| RF-1.1–1.6 Estados y transiciones | `work-order-state-machine.spec` (6 tests); `work-order-transition.service` ("rejects illegal transitions with 409", técnico ajeno) | ✅ |
| RF-1.7 Transiciones permitidas por quien consulta | "returns only the transitions the viewer may trigger (FE-08)"; "offers each role only the transitions it may trigger" | ✅ |
| RF-2.1, 2.2, 2.4 Asignación | "only accepts active technicians as assignees"; e2e de asignación | ✅ / ⏸ |
| RF-2.3 No reasignar tras iniciar la reparación | — | ⚠️ |
| RF-3 Alcance del técnico | "forbids a technician from reading another technician order (RN-06)"; "rejects a technician moving an order not assigned to them"; e2e | ✅ |
| RF-4 Precondiciones | 4 tests de `workflow-preconditions.hook.spec`; e2e "requires a technician assignment before diagnosis", "cannot be APPROVED without a customer-approved budget" | ✅ |
| RF-5 Diagnóstico solo En diagnóstico | — | ⚠️ |
| RF-6 Reserva y consumo de repuestos | 5 tests de `inventory-stock-guard.hook.spec`; e2e de reserva y consumo | ✅ (e2e ⏸) |
| RF-7.1, 7.2 Auditoría atómica | "applies the transition, runs hooks and writes the audit row (RN-12)"; "propagates a stock guard failure so the transaction rolls back and no audit is written" | ✅ |
| RF-7.3 Historial inalterable | e2e "refuses UPDATE and DELETE on the audit table (DB trigger)" | ⏸ |
| RF-7.4 Consulta del historial | e2e "delivers the device and writes one audit row per transition" | ⏸ |
| RF-8.1 Cambio simultáneo | "fails on a lost compare-and-set race before running hooks" | ✅ |
| RF-8.2 Última unidad | e2e "lets only one of two orders reserve the last unit (RN-09)" | ⏸ |
| RF-9.1, 9.2 Revelado auditado y restringido | "reveals the code to the assigned technician through the audited path (RN-03)"; "does not reveal the code to receptionists"; e2e | ✅ |
| RF-9.3 Orden sin código → 404 | — | ⚠️ |
| RF-9.4 Bitácora de accesos inalterable | — (el trigger existe; no hay test) | ⚠️ |
| RF-10 Motivo de 3 a 500 caracteres | — | ⚠️ |

**Veredicto 004: ⚠️ Cumplida en lo esencial.** Faltan pruebas de RF-2.3, 5, 9.3, 9.4 y 10; los controles de auditoría y de la última unidad dependen de e2e que no pude correr.

### Spec 005 · Consulta y panel de órdenes

| RF | Test | Resultado |
| --- | --- | --- |
| RF-1.1 Listado paginado | — (el formato de la página no se prueba) | ⚠️ |
| RF-1.2, 1.3 Filtros por estado y técnico | "passes the front desk filters through" | ✅ |
| RF-2.1 Búsqueda de texto | "keeps free text without a number (customer name, phone fragments)" | ✅ |
| RF-2.2 Búsqueda por número de orden | `work-order-queries.spec` (lectura del número) | ✅ |
| RF-2.3, 2.4 Texto vacío / número gigante | "ignores empty or blank input", "does not read numbers beyond the INTEGER column…" | ✅ |
| RF-2.5 Máximo 100 caracteres | — | ⚠️ |
| RF-3 Alcance del técnico | "forces technicians to their own queue (RN-06)", "keeps the technician scope when searching (RN-06)" | ✅ |
| RF-4.1–4.3 Resumen | "counts active orders…", "lists every status, zeros included", "asks for overdue orders among the statuses the shop still works on"; "never counts an order ready for pickup as overdue" | ✅ |
| RF-4.4 Resumen prohibido a técnico/cliente | — | ⚠️ |
| RF-5.1 Detalle con transiciones por rol | "returns only the transitions the viewer may trigger (FE-08)" | ✅ |
| RF-5.2 Orden inexistente → 404 | — (cubierto en parte por el chequeo de visibilidad) | ⚠️ |

**Veredicto 005: ⚠️ Cumplida con huecos** (RF-1.1, 2.5, 4.4, 5.2).

### Spec 006 · Presupuestos

| RF | Test | Resultado |
| --- | --- | --- |
| RF-1.1 Armado 1–50 líneas | — (límites no probados) | ⚠️ |
| RF-1.3, 1.4 Precio del catálogo y aritmética exacta | "computes labor + catalog-priced parts with Decimal arithmetic (RN-15)" | ✅ |
| RF-1.5 No armar tras la aprobación | "refuses to draft a budget once the repair was approved" | ✅ |
| RF-2.1, 2.2 Compatibilidad / repuesto inexistente | "rejects a part that does not fit the device model (RN-10)", "rejects unknown or inactive parts" | ✅ |
| RF-3 Versiones reemplazadas | — | ⚠️ |
| RF-4.1, 4.2 Envío y paso a Presupuestado | "sending the first budget moves the order to BUDGETED in the same transaction" | ✅ |
| RF-4.3 Solo se envían borradores | — | ⚠️ |
| RF-5 Aprobación atómica | "approval marks the budget and moves the order to APPROVED atomically (RN-05)"; "only SENT budgets can be decided" | ✅ |
| RF-6 Rechazo cancela la orden | "rejection cancels the work order with the reason" | ✅ |
| RF-7 Vencimiento | "rejects approval of an expired budget and marks it EXPIRED (RN-08)"; e2e "rejects approval of an expired budget" | ✅ (e2e ⏸) |
| RF-8.1 Técnicos sin acceso | e2e "does not let technicians read budgets (RN-07)" | ⏸ |
| RF-8.2 Sin costo unitario en presupuestos | — | ⚠️ |

**Veredicto 006: ⚠️ Cumplida con huecos** (RF-1.1, 3, 4.3, 8.2).

### Spec 007 · Inventario y Stock Guard

| RF | Test | Resultado |
| --- | --- | --- |
| RF-1.1–1.4, 1.6 Alta, edición y baja | — (validaciones del DTO sin test) | ⚠️ |
| RF-1.5 No dar de baja con reservas | "refuses to deactivate a part with reserved units" | ✅ |
| RF-2.2, 2.3 Costo y precio por rol | "shows unit cost to ADMIN only and hides prices from TECHNICIAN (RN-07)"; e2e "hides prices from technicians" | ✅ |
| RF-2.1, 2.4 Filtros y existencias | — | ⚠️ |
| RF-3.1 Entrada con kardex | "records a kardex row for each stock entry (BE-17)" | ✅ |
| RF-3.2, 3.3 Ajustes | "blocks a write-off larger than the unreserved stock (RN-11)" | ✅ |
| RF-4.1 Invariante de existencias | CHECK en la migración; e2e de la última unidad | ⏸ |
| RF-5.1–5.3 Reserva, bloqueo y consumo | 5 tests del hook; e2e "consumes the reservation when entering quality control" | ✅ (e2e ⏸) |
| RF-5.4 Última unidad | e2e "lets only one of two orders reserve the last unit (RN-09)" | ⏸ |
| RF-6.1 Alertas | "flags low stock when available <= min stock (RN-11)"; e2e | ✅ |
| RF-7.1 Kardex | cubierto en RF-3.1 y por el hook | ✅ |
| RF-7.2 Kardex inalterable | — | ⚠️ |

**Veredicto 007: ⚠️ Cumplida con huecos** (validaciones del catálogo, kardex inalterable).

### Spec 008 · Seguimiento del cliente

| RF | Test | Resultado |
| --- | --- | --- |
| RF-1.1 Código de 8 caracteres sin ambiguos | "generates 8 characters from an alphabet without look-alikes" | ✅ |
| RF-1.2, 1.3 Entrega única, solo hash | "returns the tracking code once and stores only its argon2 hash (SUP-05)"; e2e "never stores the code in plaintext nor returns it again" | ✅ (e2e ⏸) |
| RF-1.4 Distinto del de desbloqueo | "is never equal to the device unlock code (RN-03)" | ✅ |
| RF-2.1 Consulta sin cuenta | "returns only the customer status view for a valid code (RN-14)"; e2e | ✅ |
| RF-2.2, 2.3 Formatos y PIN de 4 dígitos | "formats and normalizes the ticket representation", "accepts the formats printed on the ticket", "rejects a 4-digit PIN-like code" | ✅ |
| RF-3.1 Mismo 404 | "answers the same 404 for a wrong code and for an unknown number" | ✅ |
| RF-3.2 Sin diferencia de tiempo | — (el código usa un hash ficticio; no hay medición) | ⚠️ |
| RF-3.3 Órdenes sin código | "rejects orders created before SUP-05 (no hash)" | ✅ |
| RF-4.1 Límite de 5 por minuto | e2e "throttles the 6th attempt within a minute" | ⏸ |
| RF-5.1 Vista del cliente | "returns only the customer status view…"; e2e "lists only status information for the customer" | ✅ |
| RF-5.2 Sin campos internos | — (no hay test de lista cerrada) | ⚠️ |
| RF-6 Reposición del código | "regenerates the code, never matching the unlock code, and replaces the hash"; e2e (4/5, 5/5) | ✅ |
| RF-7.1, 7.4 Cuenta de cliente | e2e "lists only status information for the customer", "blocks staff endpoints for customers" | ⏸ |
| RF-7.2 Cuenta sin vínculo | — | ⚠️ |
| RF-7.3 Orden ajena → 404 | "answers 404 to a customer probing a foreign order (RN-14)" | ✅ |

**Veredicto 008: ✅ Cumplida en lo esencial** (la parte más sólida del backend), con RF-3.2, 5.2 y 7.2 sin prueba.

### Specs 009 y 010 (propuestas)

| Spec | Estado | Verificación |
| --- | --- | --- |
| 009 Cookie protegida | Propuesta. Solo RF-5.1 (CORS con credenciales) existe | — RF-5.1 implementado en `main.ts`, **sin test**. Las demás tareas están pendientes |
| 010 Vencimiento automático | Propuesta. Nada implementado | — |

## 3. Hallazgos

| ID | Severidad | Dónde | Qué ocurre | Spec afectada |
| --- | --- | --- | --- | --- |
| **H1** | Media-alta | `auth.service.ts:92`, `revoked-refresh-token.repository.ts:18` | Al detectar reutilización de una credencial, `deleteManyByUser` **borra** las marcas de revocación en vez de revocar las sesiones vivas. Las credenciales ya rotadas vuelven a ser aceptables hasta su expiración natural (7 días). El test unitario pasa porque solo comprueba la llamada | 001 RF-2.2 |
| **H2** | Baja | `auth.service.ts` (`login`) | Un usuario inexistente responde sin verificar la contraseña, por lo que el **tiempo** lo distingue de uno existente (la consulta pública sí usa un hash ficticio) | 001 RNF-3 |
| **H3** | Media | `common/guards/roles.guard.ts` | Si una ruta no declara `@Roles`, `RolesGuard` **permite el paso a cualquier usuario autenticado** (incluido un cliente). Hoy solo ocurre en `logout` y `profile`, pero una ruta nueva sin decorador quedaría abierta; la constitución (C7.1) exige un `@Roles` explícito | 001 RF-7 |
| **H4** | Media | ~42 de ~46 mensajes distintos de excepción | Los mensajes del servidor están en **inglés** salvo los de autenticación; el frontend solo traduce algunos 409 y muestra el resto tal cual | Todas (C6.2, RNF de 002) |
| **H5** | Baja | `AuthController` | El límite de 10 intentos de login no tiene test | 001 RF-6 |
| **H6** | Info | Tests e2e | No se pudieron ejecutar: la verificación de auditoría inalterable y de la última unidad quedó sin confirmar hoy | 004, 007, 008 |

## 4. Reglas de la constitución

| Regla | Comprobación | Resultado |
| --- | --- | --- |
| C3.1 `src/domain` no importa Nest ni Prisma | `grep` de imports | ✅ ninguno |
| C3.3 `PrismaService` solo en repositorios | `grep` | ✅ (`main.ts` solo lo menciona en un comentario) |
| C3.3 El estado de la orden solo lo escribe el servicio de transición | `grep` de `workOrder.update*` | ✅ únicamente `work-order-transition.repository.ts` |
| C5.3 Sin `Float` | `grep` en `schema.prisma` | ✅ |
| C7.1 `@Roles` en toda ruta | conteo por controller | ❌ `logout` y `profile` sin `@Roles` (H3) |
| C6.2 Mensajes al usuario en español | listado de excepciones | ❌ mayoría en inglés (H4) |
| C4.3 Lint/typecheck/test en commit y CI | hook pre-commit y workflows | ✅ configurados; las unitarias pasan |
| `console.log` | `grep` | ✅ ninguno |

## 5. Veredicto

| Spec | Veredicto |
| --- | --- |
| 001 Autenticación | ❌ No cumplida (RF-2.2) |
| 002 Usuarios | ⚠️ Funcional; huecos de prueba y mensajes en inglés |
| 003 Recepción | ⚠️ Cumplida con huecos |
| 004 Ciclo de vida | ⚠️ Cumplida en lo esencial; auditoría y carrera pendientes de e2e |
| 005 Consulta y panel | ⚠️ Cumplida con huecos |
| 006 Presupuestos | ⚠️ Cumplida con huecos |
| 007 Inventario | ⚠️ Cumplida con huecos |
| 008 Seguimiento | ✅ Cumplida en lo esencial |
| 009 / 010 | — Propuestas |

**¿Está cumplida la spec del backend? No del todo.** Los 165 tests unitarios pasan y la funcionalidad principal está cubierta, pero: **(1)** RF-2.2 de la spec 001 está incumplido pese a su test (H1); **(2)** la constitución se incumple en C7.1 y C6.2 (H3, H4); **(3)** unos 40 sub-requisitos no tienen test; **(4)** los e2e, que sostienen la auditoría inalterable y la competencia por el stock, **no se ejecutaron** y deben correrse con Docker encendido antes de dar la spec por cerrada.
