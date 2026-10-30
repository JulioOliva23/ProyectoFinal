# Spec 004 · Ciclo de vida de la orden de trabajo

**Estado:** Implementada (spec retroactiva, 2026-10-29) · **Reglas:** RN-03, RN-04, RN-05, RN-06, RN-09, RN-12 · **Supuestos:** SUP-03, SUP-08, SUP-09 · **Historias de origen:** US-04 a US-08 y US-20

## 1. Contexto y objetivo

Una reparación atraviesa varias manos —recepción, técnico, administración— y cada paso tiene consecuencias: no se repara sin aprobación del cliente, no se arranca sin repuestos, y si hay un reclamo hay que poder demostrar **quién hizo qué y cuándo**.

**Objetivo:** que cada orden avance por un camino único y controlado, que cada persona pueda hacer solo lo que le corresponde y que todo cambio quede registrado de forma que nadie pueda reescribirlo.

## 2. Usuarios

| Rol | Interés |
| --- | --- |
| Recepción | Asigna técnicos, registra la aprobación del cliente, cancela y entrega |
| Técnico | Diagnostica, repara, controla la calidad y consulta el código de desbloqueo de **sus** equipos |
| Administrador | Puede hacer lo anterior y consulta toda la auditoría |

## 3. Historias de usuario

- **HU-1** Como recepcionista, quiero asignar un técnico a cada orden, para que alguien sea responsable.
- **HU-2** Como técnico, quiero registrar mi diagnóstico y avanzar solo mis órdenes, para reflejar el trabajo real.
- **HU-3** Como dueño, quiero que ninguna reparación empiece sin la aprobación del cliente ni sin repuestos disponibles, para no perder dinero ni dejar equipos desarmados.
- **HU-4** Como administrador, quiero un historial inalterable de cada cambio de estado, para resolver reclamos.
- **HU-5** Como técnico asignado, quiero ver el código de desbloqueo cuando lo necesito, sabiendo que queda registrado.

## 4. Requisitos funcionales

**RF-1 · Estados y transiciones** (HU-2, HU-3)
- RF-1.1 El sistema deberá manejar nueve estados: Ingresado, En diagnóstico, Presupuestado, Aprobado, En reparación, Control de calidad, Listo para entrega, Entregado y Cancelado.
- RF-1.2 El sistema deberá permitir únicamente estas transiciones, cada una por los roles indicados:

| Desde → Hacia | Quién puede |
| --- | --- |
| Ingresado → En diagnóstico | Técnico, Administrador |
| Ingresado / En diagnóstico / Presupuestado → Cancelado | Recepción, Administrador |
| En diagnóstico → Presupuestado | Técnico, Recepción, Administrador |
| Presupuestado → Aprobado | Recepción, Administrador |
| Aprobado → En reparación | Técnico, Administrador |
| En reparación → Control de calidad | Técnico, Administrador |
| Control de calidad → Listo para entrega | Técnico, Administrador |
| Control de calidad → En reparación (retrabajo) | Técnico, Administrador |
| Listo para entrega → Entregado | Recepción, Administrador |
| Cancelado → Entregado (se devuelve el equipo) | Recepción, Administrador |

- RF-1.3 Si se pide una transición que no está en la tabla, entonces el sistema deberá rechazarla por conflicto.
- RF-1.4 Si la transición existe pero el rol no puede hacerla, entonces el sistema deberá rechazarla como prohibida.
- RF-1.5 Mientras una orden esté Entregada, el sistema no deberá permitir ninguna transición (estado final).
- RF-1.6 Si un cliente intenta mover una orden, entonces el sistema deberá rechazarlo.
- RF-1.7 Cuando se consulta una orden, el sistema deberá informar solo las transiciones que quien consulta puede ejecutar (vacío para un técnico que no es el asignado).

**RF-2 · Asignación de técnico** (HU-1)
- RF-2.1 Cuando recepción o un administrador asigna un técnico activo a una orden, el sistema deberá guardar la asignación.
- RF-2.2 El sistema deberá permitir reasignar el técnico mientras la orden esté en Ingresado, En diagnóstico, Presupuestado o Aprobado.
- RF-2.3 Si la orden ya está en reparación o más allá, entonces el sistema deberá rechazar la reasignación.
- RF-2.4 Si la persona elegida no es un técnico activo, entonces el sistema deberá rechazar la asignación.

**RF-3 · Alcance del técnico** (HU-2)
- RF-3.1 Mientras quien actúa sea técnico, el sistema solo deberá permitirle ver y mover las órdenes que tiene asignadas.
- RF-3.2 Si un técnico intenta ver o mover una orden ajena, entonces el sistema deberá rechazarlo como prohibido.

**RF-4 · Precondiciones del flujo** (HU-3)
- RF-4.1 Cuando se intenta pasar a En diagnóstico sin técnico asignado, el sistema deberá bloquear la transición.
- RF-4.2 Cuando se intenta pasar a Presupuestado sin un presupuesto enviado al cliente, el sistema deberá bloquear la transición.
- RF-4.3 Cuando se intenta pasar a Aprobado sin un presupuesto aprobado por el cliente, el sistema deberá bloquear la transición.

**RF-5 · Diagnóstico** (HU-2)
- RF-5.1 Mientras la orden esté En diagnóstico, el sistema deberá permitir al técnico asignado o a un administrador registrar el diagnóstico preliminar (5 a 2000 caracteres).
- RF-5.2 Si la orden está en otro estado, entonces el sistema deberá rechazar el registro del diagnóstico.

**RF-6 · Control de repuestos al reparar** (HU-3) *(detalle en spec 007)*
- RF-6.1 Cuando una orden pasa a En reparación, el sistema deberá reservar todos los repuestos del presupuesto aprobado.
- RF-6.2 Si falta stock de algún repuesto, entonces el sistema deberá bloquear la transición, deshacer todas las reservas hechas y nombrar los repuestos faltantes.
- RF-6.3 Cuando una orden pasa a Control de calidad, el sistema deberá descontar del inventario físico los repuestos reservados.
- RF-6.4 Cuando una orden vuelve de Control de calidad a En reparación, el sistema no deberá reservar ni descontar de nuevo.

**RF-7 · Historial inalterable** (HU-4)
- RF-7.1 Cuando una orden cambia de estado, el sistema deberá registrar fecha, persona, estado anterior, estado nuevo y motivo si lo hay, en la misma operación que el cambio.
- RF-7.2 Si no se puede registrar el historial, entonces el sistema deberá deshacer el cambio de estado.
- RF-7.3 El sistema no deberá permitir modificar ni borrar ningún registro del historial, ni siquiera a un administrador.
- RF-7.4 Cuando el personal consulta una orden que puede ver, el sistema deberá devolver su historial en orden cronológico con el nombre de quien actuó.

**RF-8 · Cambios simultáneos** (HU-2)
- RF-8.1 Si dos personas intentan mover la misma orden a la vez, entonces el sistema deberá aplicar solo una y rechazar la otra por conflicto, sin tocar el inventario.
- RF-8.2 Cuando dos órdenes compiten por la última unidad de un repuesto, el sistema deberá permitir que solo una entre en reparación.

**RF-9 · Código de desbloqueo** (HU-5)
- RF-9.1 Cuando el técnico asignado o un administrador pide ver el código, el sistema deberá registrar quién y cuándo lo pidió y luego mostrarlo.
- RF-9.2 Si quien lo pide es recepción, un técnico no asignado o un cliente, entonces el sistema deberá negarlo.
- RF-9.3 Si la orden no tiene código, entonces el sistema deberá responder "no encontrado".
- RF-9.4 El sistema no deberá permitir modificar ni borrar el registro de accesos al código.

**RF-10 · Motivo de cancelación**
- RF-10.1 Cuando se informa un motivo, el sistema deberá aceptar de 3 a 500 caracteres y guardarlo en el historial.

## 5. Requisitos no funcionales

- **RNF-1 Atomicidad:** cambio de estado, efectos sobre inventario e historial ocurren juntos o no ocurren.
- **RNF-2 Fuente única:** ningún otro camino del sistema puede cambiar el estado de una orden.
- **RNF-3 Trazabilidad:** la persona que figura en el historial sale de la sesión, nunca de datos enviados.
- **RNF-4 Concurrencia:** sin bloqueos mutuos entre dos órdenes que reservan varios repuestos a la vez.

## 6. Casos límite

- Presupuesto aprobado con repuestos agotados justo antes de iniciar: la orden se queda en Aprobado y se informa qué falta.
- Control de calidad fallido varias veces: cada retrabajo queda en el historial.
- Cancelar después de aprobar: no está permitido (SUP-08); las reservas nunca se liberan porque nunca se crean antes de reparar.
- Orden Cancelada: aún puede pasar a Entregada para devolver el equipo.
- Técnico desactivado con órdenes asignadas: las órdenes siguen asignadas a él hasta que alguien las reasigne.

## 7. Fuera de alcance

Garantías, liquidación y cobro, bahías de trabajo, hallazgos adicionales durante la reparación (se resuelven con otra versión de presupuesto), notificaciones al cliente.

## 8. Criterios de finalización

- [x] RF-1 a RF-9 tienen al menos un test que pasa (RF-10 sin test específico).
- [x] El historial rechaza `UPDATE` y `DELETE` en la base de datos (test e2e).
- [ ] RF-9.4 tiene un test que intente modificar el registro de accesos.
- [ ] RF-2.3 (reasignación tras iniciar la reparación) tiene un test.

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** ¿Qué pasa si el cliente se arrepiente después de aprobar, o el equipo resulta irreparable durante la reparación? Hoy no hay cancelación posible (SUP-08).
- **[NECESITA ACLARACIÓN]** ¿Cuánto tiempo debe conservarse el código de desbloqueo? ¿Se borra al entregar el equipo? (SUP-09).
- **[NECESITA ACLARACIÓN]** ¿Se debe avisar al cliente automáticamente en cada cambio de estado?
