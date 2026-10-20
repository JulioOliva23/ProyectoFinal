# Sistema de gestión para un servicio técnico de celulares

> Ficha del problema **reconstruida por el equipo** a partir del dominio ya implementado en `servicio_back` y `servicio_front`, siguiendo el formato de la ficha P04 del proyecto base (`pdis/ai-context/00-contexto-problema.md`).
>
> **No es el enunciado original del docente.** Si existe una ficha oficial, reemplaza este archivo por su transcripción literal y mueve a [supuestos.md](supuestos.md) todo lo que aquí se dedujo. Mientras tanto, cada dato que no proviene del código queda marcado como supuesto `SUP-xx`.

| Dominio | Complejidad | Proyecto base |
| --- | --- | --- |
| Servicios técnicos | Media-alta | P04 — Taller mecánico (`pdis/`) |

---

## Contexto

Un local de servicio técnico repara teléfonos celulares: cambio de pantallas, baterías, flex de carga, cámaras y reparaciones de placa (micro-soldadura de componentes SMD e IC). Atiende en mostrador, donde una persona de recepción recibe los equipos, y cuenta con técnicos que trabajan en el banco de reparación y un pequeño almacén de repuestos electrónicos.

**Organización afectada:** un solo local con recepción, técnicos de banco, un administrador y un almacén de repuestos compatibles con muchos modelos comerciales.

## Problema principal

Los equipos se reciben con una nota de papel. No queda registro del estado físico del celular al ingresar, el código de desbloqueo se anota a mano y circula sin control, y nadie sabe en qué estado está una reparación sin preguntarle al técnico. Los clientes llaman para saber si su equipo está listo, los presupuestos se aprueban por teléfono o WhatsApp sin dejar constancia y los repuestos se usan sin descontarse del almacén.

## Usuarios principales

| Usuario | Rol en el sistema | Qué necesita |
| --- | --- | --- |
| Recepcionista | `RECEPTIONIST` | Registrar el ingreso del equipo con su estado físico, asignar técnico, armar y registrar la decisión del presupuesto, entregar el equipo |
| Técnico | `TECHNICIAN` | Ver solo sus equipos asignados, diagnosticar, consultar el código de desbloqueo cuando lo necesita y avanzar el estado de la reparación |
| Administrador | `ADMIN` | Todo lo anterior, más el catálogo de repuestos, ajustes de inventario, costos y gestión de usuarios |
| Cliente | `CUSTOMER` / público | Consultar el estado de su equipo sin llamar al local |

## Proceso actual

1. El cliente llega con el equipo y describe la falla; recepción anota los datos en papel.
2. Recepción decide qué técnico lo atiende.
3. El técnico diagnostica y recepción arma el presupuesto con mano de obra y repuestos.
4. Recepción llama o escribe al cliente para que apruebe.
5. Si aprueba, el técnico toma los repuestos del almacén y repara.
6. El técnico prueba el equipo y recepción lo entrega al cliente.

## Dificultades observadas

| # | Dificultad | Atendida por |
| --- | --- | --- |
| D1 | No se sabe en qué estado está una reparación sin preguntar en persona | [E1](backlog/E1-recepcion-asignacion-y-ciclo-de-la-orden.md), [E4](backlog/E4-seguimiento-y-comunicacion-con-el-cliente.md) |
| D2 | No queda constancia del estado físico del equipo al ingresar (rayones, fisuras, batería) | [E1](backlog/E1-recepcion-asignacion-y-ciclo-de-la-orden.md) — check-in cosmético |
| D3 | El código de desbloqueo del cliente se anota en papel y cualquiera puede verlo | [E1](backlog/E1-recepcion-asignacion-y-ciclo-de-la-orden.md) — cifrado y revelado auditado |
| D4 | Presupuestos aprobados por teléfono sin registro de quién, cuándo ni por qué canal | [E2](backlog/E2-presupuestos-y-aprobacion-del-cliente.md) |
| D5 | Se usan repuestos que nadie descontó del almacén, o se descubre a mitad de la reparación que no hay stock | [E3](backlog/E3-inventario-de-repuestos.md) |
| D6 | Cuando el mismo equipo vuelve, nadie recuerda qué se le hizo | [E1](backlog/E1-recepcion-asignacion-y-ciclo-de-la-orden.md) — historial por IMEI |

## Restricciones

| # | Restricción | Atendida por |
| --- | --- | --- |
| R1 | Debe funcionar desde navegador, en escritorio (mostrador) y en tablet o celular (banco del técnico) | `FE-` — frontend adaptativo |
| R2 | La orden de trabajo debe recorrer estados claros y auditables | Máquina de estados de la OT (RN-04, RN-12) |
| R3 | Debe controlar el stock de repuestos al usarlos | Stock Guard (RN-09, RN-11) |
| R4 | Debe conservar el historial por equipo | Historial por IMEI (RN-13) |
| R5 | El código de desbloqueo del cliente no puede quedar expuesto | Cifrado AES-256-GCM y revelado auditado (RN-03) |

## Resultado esperado

Un sistema donde cada equipo tenga una orden de trabajo con estado visible para el personal y para el cliente, con su estado físico registrado al ingresar, el código de desbloqueo protegido, los presupuestos aprobados por escrito, los repuestos reservados y descontados al usarse, y el historial del equipo disponible la próxima vez que entre.

## Complejidad aproximada

Media-alta. El valor está en la máquina de estados de la orden de trabajo, su relación con el inventario (reserva y consumo atómicos), la protección de un dato sensible del cliente (código de desbloqueo) y el acceso del cliente sin exponer información interna.

---

## Diferencias con el proyecto base (P04 — Taller mecánico)

| Taller mecánico | Servicio técnico de celulares |
| --- | --- |
| Vehículo identificado por placa | Dispositivo identificado por IMEI validado con Luhn |
| Exclusión de vehículos eléctricos | Sin exclusiones de equipo; el IMEI debe ser legible (SUP-01) |
| 4 bahías físicas | Sin bahías: la capacidad la define el técnico asignado |
| Mecánico, jefe de taller | Técnico; el administrador asume las funciones de jefatura |
| Consulta pública con placa y documento | Cuenta `CUSTOMER` o número de OT + código de seguimiento (SUP-05) |
| Garantías, liquidación, hallazgos adicionales | Fuera del MVP |
| — | Check-in cosmético, batería y código de desbloqueo cifrado |
| — | Compatibilidad de repuestos por modelo comercial |
| — | Vencimiento y versionado de presupuestos (SUP-04) |

## Los seis escalones para preguntar

Se conserva la metodología del proyecto base para la sesión con el cliente. Las preguntas están en [preguntas-cliente.md](preguntas-cliente.md) y las respuestas se registran en [registro-respuestas-cliente.md](registro-respuestas-cliente.md).

| # | Escalón | Pregunta tipo |
| --- | --- | --- |
| 1 | Contexto | ¿Quiénes son y qué hacen hoy? |
| 2 | Proceso | ¿Cómo lo hacen, paso a paso? |
| 3 | Reglas | ¿Qué está permitido y qué no? |
| 4 | Excepciones | ¿Qué pasa cuando sale mal? |
| 5 | Permisos | ¿Quién puede hacer qué? |
| 6 | Datos | ¿Qué hay que conservar y por cuánto tiempo? |
