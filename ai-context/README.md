# ai-context

Contexto compartido del **Sistema de Gestión para Servicio Técnico de Celulares**, derivado del proyecto base *P04 — Taller mecánico* (`pdis/`).

Esta carpeta es la fuente de verdad de **qué** se construye, **por qué** y **cómo** se escribe el código. El código vive en:

- `backPF/servicio_back` (NestJS 11 + Prisma 7 + PostgreSQL 17)
- `frontPF` (`servicio_front`: React 19 + Vite + TypeScript)
- `backPF/tools` (Docker Compose de PostgreSQL)

> **Si vas a programar —o eres un agente de IA asistiendo al equipo— empieza por [`../AI_CONTEXT.md`](../AI_CONTEXT.md) y [constitution/00-general.md](constitution/00-general.md).** Ahí están las reglas técnicas y de dominio obligatorias. El resto de esta carpeta es el análisis funcional y la trazabilidad de requerimientos.

## Contenido

### Análisis funcional — qué se construye y por qué

| Documento | Para qué sirve |
| --- | --- |
| [00-contexto-problema.md](00-contexto-problema.md) | Ficha del problema, reconstruida por el equipo (no es el enunciado original) |
| [backlog/](backlog/) | User Stories y criterios Gherkin agrupados por épicas `E1` a `E4` |
| [backlog.md](backlog.md) | Orden de construcción de `servicio_front` (`US-F`), enlazado con las US de las épicas |
| [supuestos.md](supuestos.md) | Registro de supuestos `SUP-xx` y módulos fuera del MVP |
| [preguntas-cliente.md](preguntas-cliente.md) | Banco de preguntas `P-xx` por los seis escalones para la sesión con el cliente |
| [registro-respuestas-cliente.md](registro-respuestas-cliente.md) | Registro textual de respuestas del cliente (pendiente de sesión) |

### Épicas

- **E1:** [Recepción, asignación y ciclo de la orden de trabajo](backlog/E1-recepcion-asignacion-y-ciclo-de-la-orden.md) — US-00 a US-08, US-21
- **E2:** [Presupuestos y aprobación del cliente](backlog/E2-presupuestos-y-aprobacion-del-cliente.md) — US-09 a US-12
- **E3:** [Inventario de repuestos](backlog/E3-inventario-de-repuestos.md) — US-13 a US-16
- **E4:** [Seguimiento, comunicación con el cliente y entrega](backlog/E4-seguimiento-y-comunicacion-con-el-cliente.md) — US-17 a US-20

### Constitución técnica — cómo se escribe el código

| Documento | Para qué sirve |
| --- | --- |
| [constitution/00-general.md](constitution/00-general.md) | `GEN-` · Idioma, vocabulario, stack, git y DoD |
| [constitution/backend.md](constitution/backend.md) | `BE-` · NestJS 11, capas, Prisma 7, REST, seguridad y testing |
| [constitution/frontend.md](constitution/frontend.md) | `FE-` · Mapeo desde `taller_front`, rutas RBAC, UI segura del código de desbloqueo |
| [constitution/tools.md](constitution/tools.md) | `TL-` · Docker (5433), migraciones, seed, tests, Husky, CI y variables de entorno |

## Estado de las reglas y el backlog

El análisis parte de las **15 reglas de negocio (`RN-01` a `RN-15`)** de [AI_CONTEXT.md §4](../AI_CONTEXT.md#4-reglas-de-negocio-rn). Todavía no hay una sesión con el cliente registrada: salvo SUP-05, los supuestos están implementados pero sin confirmar.

- **Máquina de estados estricta:** la OT recorre `RECEIVED → IN_DIAGNOSIS → BUDGETED → APPROVED → IN_REPAIR → QUALITY_CONTROL → READY_FOR_DELIVERY → DELIVERED`, con `CANCELLED` antes de la aprobación y retrabajo desde control de calidad (`RN-04`). Los enums son ingleses; las etiquetas de interfaz, españolas.
- **Stock Guard:** los repuestos se reservan al entrar a `IN_REPAIR` y se descuentan al entrar a `QUALITY_CONTROL`; si falta stock, la reparación no empieza (`RN-09`).
- **Dato sensible del cliente:** el código de desbloqueo se guarda cifrado y solo lo revela el técnico asignado o un administrador, con auditoría (`RN-03`).
- **Consulta del cliente:** cuenta `CUSTOMER` o número de OT + código de seguimiento, sin información interna (`RN-14`, SUP-05).
- **Estado de implementación:** el backend cubre todas las US; en el frontend falta la administración de usuarios y modelos (US-21) y el contador de stock bajo en el menú (US-16).

## Cómo se usa

### Antes de la sesión con el cliente

- Leer [00-contexto-problema.md](00-contexto-problema.md) y, si existe, reemplazarla por la ficha oficial.
- Revisar los supuestos en [supuestos.md](supuestos.md).
- Priorizar las preguntas en [preguntas-cliente.md](preguntas-cliente.md).

### Durante la sesión

- Registrar en [registro-respuestas-cliente.md](registro-respuestas-cliente.md) las declaraciones **textuales** del cliente.
- Recorrer los seis escalones en orden: Contexto → Proceso → Reglas → Excepciones → Permisos → Datos.

### Después de la sesión

- Actualizar el estado de cada supuesto en [supuestos.md](supuestos.md) (`Confirmado` o `Refutado`).
- Ajustar las User Stories de `backlog/` y, si cambia el frontend, [backlog.md](backlog.md).

## Convenciones de identificadores

| Prefijo | Qué identifica | Dónde vive |
| --- | --- | --- |
| `US-xx` | User Story funcional | [backlog/](backlog/) |
| `US-Fxx` | Historia de construcción del frontend | [backlog.md](backlog.md) |
| `E-x` | Épica de trabajo | [backlog/](backlog/) |
| `RN-xx` | Regla de negocio | [AI_CONTEXT.md §4](../AI_CONTEXT.md#4-reglas-de-negocio-rn) |
| `SUP-xx` | Supuesto o riesgo técnico | [supuestos.md](supuestos.md) |
| `P-xx` | Pregunta de relevamiento | [preguntas-cliente.md](preguntas-cliente.md) |
| `GEN-xx` | Regla arquitectónica general | [constitution/00-general.md](constitution/00-general.md) |
| `BE-xx` | Regla técnica de backend | [constitution/backend.md](constitution/backend.md) |
| `FE-xx` | Regla técnica de frontend | [constitution/frontend.md](constitution/frontend.md) |
| `TL-xx` | Regla técnica de infraestructura | [constitution/tools.md](constitution/tools.md) |
