# Verificación de las specs del backend

**Fecha:** 2026-10-30 · **Rama:** `feat/sdd-closure` (actualizada con `main` `6ecd2f1`, que trae el agente IA, + spec 011) · **Constitución:** [docs/constitution.md](../docs/constitution.md)

Este informe sustituye al de la primera versión, que encontró incumplimientos. Todos los hallazgos se corrigieron en esta rama; el detalle de **qué test prueba cada requisito** se genera solo en [trazabilidad.md](trazabilidad.md).

## 1. Qué se ejecutó

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| Tipos | `npx tsc --noEmit` | ✅ sin errores |
| Lint | `npm run lint` | ✅ sin errores |
| Unitarias (Jest) | `npx jest` | ✅ **22 suites · 244 tests** |
| e2e (Supertest + PostgreSQL 17 real) | `npm run test:e2e` | ✅ **3 suites · 45 tests** |
| Build de producción | `npm run build` | ✅ |
| Trazabilidad spec → test | `npm run sdd:check` | ✅ **64 de 64 requisitos** y **182 de 182 criterios de aceptación** con test etiquetado |

Observación honesta: en una corrida completa, un test e2e falló una vez y **no pude reproducirlo** en 8 corridas posteriores (5 seguidas y 3 con la máquina cargada). Si reaparece, hay que atraparlo con el log de esa corrida.

## 2. Cómo se comprueba un requisito

Cada título de test lleva la etiqueta del requisito que prueba, por ejemplo `[001/RF-2.2]`. `scripts/sdd/check-traceability.mjs` (hook pre-commit y job `sdd` de la CI) falla si:

- un requisito (`RF-n`) o un criterio de aceptación (`RF-n.m`) de una spec implementada no tiene un test etiquetado;
- un test cita un requisito o una spec que no existe.

Se probó que falla: con una carpeta de tests vacía lista todos los requisitos sin test, y con una etiqueta inventada la rechaza. Las specs `009` y `010` son propuestas y están exentas hasta que se implementen.

**Límite de la herramienta:** comprueba que *existe* un test etiquetado, no que sea suficiente. Que el test pruebe de verdad el requisito sigue dependiendo de la revisión del Pull Request.

## 3. Veredicto por spec

| Spec | Veredicto | Evidencia principal |
| --- | --- | --- |
| 001 Autenticación y sesiones | ✅ Cumplida | e2e real de reutilización: la credencial más nueva también queda sin efecto y la lista de denegación no se borra; límite de 10 intentos; `RolesGuard` falla cerrado |
| 002 Gestión de usuarios | ✅ Cumplida | límites de usuario y contraseña; el reinicio de contraseña corta sesiones previas (e2e) |
| 003 Recepción y dispositivos | ✅ Cumplida | atomicidad del ingreso y reventa con historial (e2e) |
| 004 Ciclo de vida de la orden | ✅ Cumplida | auditoría y registro de accesos inalterables (e2e); carrera por la última unidad |
| 005 Consulta y panel | ✅ Cumplida | resumen prohibido a técnico y cliente (e2e); página fuera de rango |
| 006 Presupuestos | ✅ Cumplida | versiones reemplazadas, rechazo atómico y respuesta sin costo unitario (e2e) |
| 007 Inventario y Stock Guard | ✅ Cumplida | invariante de existencias ante una escritura directa; kardex inalterable (e2e) |
| 008 Seguimiento del cliente | ✅ Cumplida | lista cerrada de 8 campos; mismo hash verificado exista o no la orden |
| 009 Cookie protegida | — Propuesta | solo CORS con credenciales (sin test) |
| 010 Vencimiento automático | — Propuesta | sin implementar |
| 011 Propuestas del agente IA | ✅ Cumplida | cuatro ojos, vencimiento, candado contra doble ejecución y ejecución con la identidad de quien aprueba; servidor MCP (9) y hooks (17) en la CI |

## 4. Hallazgos de la primera verificación

| ID | Qué ocurría | Estado |
| --- | --- | --- |
| **H1** (media-alta) | La reutilización de una credencial de renovación **borraba** la lista de denegación y reabría las credenciales ya rotadas | ✅ **Corregido** (`01e3a7f`). Ahora `invalidateSessions` adelanta `updated_at` un segundo y la lista se conserva. Lo prueba un e2e que falla con el código anterior |
| **H2** (baja) | El tiempo de respuesta del login delataba si el usuario existía | ✅ **Corregido** (`01e3a7f`). Se verifica un hash ficticio cuando no hay cuenta |
| **H3** (media) | `RolesGuard` dejaba pasar a cualquier sesión en una ruta sin `@Roles` | ✅ **Corregido** (`01e3a7f`). Falla cerrado; `logout` y `profile` declaran todos los roles |
| **H4** (media) | ~42 mensajes de error en inglés | ✅ **Corregido** (`3a5a882` y siguientes): servicios, DTO, hooks, mensajes de Nest y validación por defecto; el motivo que queda en el historial al rechazar un presupuesto también |
| **H5** (baja) | El límite de login no tenía test | ✅ e2e `auth-session` |
| **H6** (info) | e2e sin ejecutar | ✅ Ejecutados contra PostgreSQL 17 real |

### Límites y efectos conocidos

- **Ventana de 1 s tras una reutilización:** al adelantar `updated_at` un segundo, una sesión iniciada en el segundo siguiente a una reutilización detectada no puede renovarse durante ese instante. Se aceptó a cambio de que ninguna credencial del mismo segundo sobreviva. Está en el plan 001.
- **Mensajes de validación:** se traducen por tipo de restricción (largo, mínimo, máximo, UUID, enum, lista, formato…). Una restricción nueva que no esté en el diccionario muestra `El campo «x» no es válido` hasta que se agregue.
- **Requisitos no funcionales** como rendimiento (RNF de la spec 005) no se midieron.
- **Dudas abiertas:** 5 tareas siguen pendientes porque necesitan una decisión del cliente, no código (recuperación de contraseña, último administrador, retención del código de desbloqueo, cancelación tras aprobar, momento del descuento físico).

## 5. Reglas de la constitución

| Regla | Comprobación | Resultado |
| --- | --- | --- |
| C2.3 / C4.1 Todo requisito tiene un test | `npm run sdd:check` | ✅ 57/57 y 167/167 |
| C3.1 `src/domain` sin Nest ni Prisma | `grep` | ✅ |
| C3.3 `PrismaService` solo en repositorios; el estado de la orden solo lo escribe el servicio de transición | `grep` | ✅ |
| C4.3 Lint, tipos y tests antes de cada commit y en la CI | hook pre-commit y workflows | ✅ (más el job `sdd`) |
| C5.3 Sin `Float` | `grep` | ✅ |
| C5.4 Bitácoras inalterables por trigger | e2e de auditoría, accesos al código y kardex | ✅ las tres |
| C6.2 Mensajes en español | pruebas del traductor y del filtro | ✅ |
| C7.1 `@Roles` o `@Public` en toda ruta | `roles.guard.spec` (falla cerrado) | ✅ |

## 6. Veredicto

**La spec del backend está cumplida.** Las nueve specs implementadas tienen test etiquetado para sus 64 requisitos y sus 182 criterios de aceptación, los 244 unitarios y los 45 e2e pasan, y los seis hallazgos de la primera verificación están corregidos. Quedan pendientes solo las decisiones del cliente y las dos specs propuestas (009 y 010), que no están implementadas a propósito.
