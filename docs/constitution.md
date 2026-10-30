# Constitución del backend · Servicio Técnico de Celulares

Principios **innegociables**. Son cortos a propósito y cada uno dice cómo se comprueba. Si un cambio los contradice, se cambia el cambio, no la constitución; modificarla exige un Pull Request propio aprobado por otro integrante.

Las reglas técnicas detalladas (BE-xx, GEN-xx) siguen en [`ai-context/constitution/`](../ai-context/constitution/); esta constitución es el resumen verificable que gobierna las specs de [`specs/`](../specs/).

## 1. Simplicidad del stack

- **C1.1** El stack es cerrado: Node.js 24, TypeScript `strict`, NestJS, Prisma y PostgreSQL. No se agregan colas, cachés, Redis, microservicios ni un segundo ORM.
- **C1.2** Un único gestor de paquetes (npm) con `package-lock.json` versionado.
- **C1.3** Una dependencia nueva solo entra si el `plan.md` de una spec la justifica y nombra la alternativa descartada.
- *Se comprueba:* `package.json` contra los `plan.md`; la CI instala con `npm ci` y falla si el lock no coincide.

## 2. La spec manda sobre el código

- **C2.1** Todo comportamiento visible para una persona usuaria tiene un requisito `RF-x` en `specs/<NNN-nombre>/spec.md`.
- **C2.2** Un cambio de comportamiento actualiza primero la spec (o en el mismo Pull Request). Si el código y la spec discrepan, **gana la spec** y se corrige el código o se enmienda la spec con una decisión explícita.
- **C2.3** Cada requisito se traza hacia abajo: `plan.md` dice qué parte lo cubre, `tasks.md` qué tarea lo implementó y `specs/verificacion.md` qué test lo comprueba.
- **C2.4** Las dudas se declaran como `[NECESITA ACLARACIÓN]`; nunca se resuelven en silencio dentro del código (se registran como `SUP-xx`).
- *Se comprueba:* revisión del Pull Request contra la checklist de la spec; `specs/verificacion.md` sin requisitos "sin cubrir" al cerrar una spec.

## 3. Lógica separada de la interfaz HTTP

- **C3.1** La lógica de negocio pura vive en `src/domain/` y **no importa** NestJS ni Prisma.
- **C3.2** Cadena de capas fija: `controller → service → repository → Prisma`. El controller solo traduce HTTP; las reglas viven en services y dominio.
- **C3.3** Solo los repositorios usan `PrismaService`. Nada escribe `WorkOrder.status` fuera de `WorkOrderTransitionService`.
- **C3.4** DTO de entrada, modelo de base de datos y DTO de salida son tipos distintos; la salida nunca expone `passwordHash`, el cifrado del código de desbloqueo ni costos a quien no corresponde.
- *Se comprueba:* `grep` de imports prohibidos en `src/domain/` y de `PrismaService` fuera de `repositories/`; revisión de DTOs de salida.

## 4. Política de tests

- **C4.1** Cada requisito `RF-x` tiene al menos un test que lo cubre, con un caso positivo y uno negativo cuando el requisito tiene una condición de error.
- **C4.2** Unitarios (Jest, repositorios simulados) para services, hooks y dominio; e2e (Supertest contra PostgreSQL real, base separada) para el flujo completo, el control de acceso por rol y las restricciones de base de datos.
- **C4.3** `lint`, `typecheck` y `test` pasan antes de cada commit (hook pre-commit) y en la CI antes de cualquier despliegue.
- **C4.4** Un defecto corregido empieza por un test que falla.
- **C4.5** Los nombres de los tests citan la regla: `it('rejects approval of an expired budget (RN-08)')`.
- *Se comprueba:* la CI en verde; el hook pre-commit; `specs/verificacion.md`.

## 5. Persistencia de datos

- **C5.1** PostgreSQL es la única fuente de verdad. No hay estado de negocio en memoria ni en archivos.
- **C5.2** El esquema cambia **solo** con migraciones de Prisma versionadas. `migrate reset`, `db push` y SQL destructivo requieren confirmación explícita de una persona y los bloquea el hook de Claude Code.
- **C5.3** Los importes usan `Decimal(12,2)`; `Float` está prohibido. La moneda es BOB.
- **C5.4** Las tablas de auditoría, kardex y accesos al código de desbloqueo son *append-only* y lo hace cumplir la base de datos (triggers), no la aplicación.
- **C5.5** Los secretos viven en variables de entorno; `.env` jamás se versiona y el código de desbloqueo se guarda solo cifrado.
- *Se comprueba:* carpeta `prisma/migrations/`; test e2e que intenta `UPDATE`/`DELETE` sobre la auditoría; hook pre-commit que rechaza `.env`.

## 6. Idioma del código y de los mensajes

- **C6.1** Código, identificadores, enums, nombres de tests y mensajes de commit (Conventional Commits) van en **inglés**.
- **C6.2** Documentación, specs y todo texto que lee una persona usuaria (mensajes de error, etiquetas, descripciones de Swagger) van en **español**.
- **C6.3** Los enums se guardan en inglés (`IN_REPAIR`); su etiqueta en español vive en un único lugar.
- *Se comprueba:* revisión del Pull Request; Swagger en `/api`.

## 7. Seguridad por defecto

- **C7.1** Toda ruta exige sesión y un `@Roles(...)` explícito. `@Public()` solo en inicio de sesión, renovación, consulta pública del cliente y documentación.
- **C7.2** Toda entrada pasa por un DTO validado (`whitelist` y `forbidNonWhitelisted`) con longitudes máximas.
- **C7.3** El control de pertenencia (técnico → sus órdenes, cliente → las suyas) se verifica en el service, no solo por rol.
- *Se comprueba:* test e2e de acceso por rol; revisión de cada controller nuevo.
