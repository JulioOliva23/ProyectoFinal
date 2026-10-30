# Spec 006 · Presupuestos y aprobación del cliente

**Estado:** Implementada (spec retroactiva, 2026-10-29) · **Reglas:** RN-05, RN-07, RN-08, RN-10, RN-15 · **Supuestos:** SUP-04, SUP-10 · **Historias de origen:** US-09 a US-12

## 1. Contexto y objetivo

El precio de una reparación varía con el tipo de cambio y con el repuesto necesario. Para evitar discusiones, el cliente debe **aprobar explícitamente un precio por escrito en el sistema** antes de que se toque su equipo, y ese precio debe poder cambiar sin perder el historial de lo que se ofreció.

**Objetivo:** armar presupuestos con mano de obra y repuestos compatibles, enviarlos, registrar la decisión del cliente y asegurar que ninguna reparación empiece sin aprobación vigente.

## 2. Usuarios

| Rol | Interés |
| --- | --- |
| Recepción y administrador | Arman, envían y registran la decisión del cliente |
| Técnico | **No** ve presupuestos ni precios (solo el estado de su orden) |
| Cliente | Ve únicamente el total del presupuesto vigente (spec 008) |

## 3. Historias de usuario

- **HU-1** Como recepcionista, quiero armar un presupuesto con mano de obra y repuestos del catálogo, para cotizar rápido y sin errores de precio.
- **HU-2** Como recepcionista, quiero enviarlo al cliente y registrar su respuesta con el canal que usó, para dejar constancia.
- **HU-3** Como dueño, quiero que un presupuesto venza, para no honrar precios viejos.
- **HU-4** Como recepcionista, quiero emitir una nueva versión si cambia el precio o la falla, sin perder las anteriores.

## 4. Requisitos funcionales

**RF-1 · Armado del presupuesto** (HU-1)
- RF-1.1 Cuando recepción o un administrador arma un presupuesto para una orden En diagnóstico o Presupuestada, el sistema deberá crear una versión en borrador con entre 1 y 50 líneas.
- RF-1.2 El sistema deberá aceptar líneas de **mano de obra** (descripción de 3 a 255 caracteres, cantidad de 1 a 50 y precio unitario con hasta dos decimales fijado por quien arma) y líneas de **repuesto** (cantidad de 1 a 50).
- RF-1.3 Mientras la línea sea de repuesto, el sistema deberá tomar el precio del catálogo; no deberá aceptar un precio enviado por quien arma.
- RF-1.4 El sistema deberá calcular subtotal de mano de obra, subtotal de repuestos y total con aritmética decimal exacta, a dos decimales y en bolivianos.
- RF-1.5 Si la orden ya fue aprobada o está en otro estado distinto de En diagnóstico o Presupuestada, entonces el sistema deberá rechazar el armado.

**RF-2 · Repuestos compatibles** (HU-1)
- RF-2.1 Si un repuesto no es compatible con el modelo del equipo, entonces el sistema deberá rechazar el presupuesto indicando cuáles repuestos no corresponden.
- RF-2.2 Si un repuesto no existe o está dado de baja, entonces el sistema deberá rechazar el presupuesto.

**RF-3 · Versiones** (HU-4)
- RF-3.1 Cuando se envía una versión nueva, el sistema deberá marcar como reemplazadas las anteriores enviadas, sin borrar ninguna.
- RF-3.2 El sistema deberá numerar las versiones de cada orden y permitir consultarlas todas o una por número.

**RF-4 · Envío** (HU-2)
- RF-4.1 Cuando se envía un presupuesto en borrador, el sistema deberá marcarlo como enviado, fijar su vencimiento a los días de validez configurados (7 por defecto) desde ese momento y registrar la fecha de envío.
- RF-4.2 Cuando la orden estaba En diagnóstico, el sistema deberá pasarla a Presupuestado en la misma operación que el envío.
- RF-4.3 Si el presupuesto no está en borrador, entonces el sistema deberá rechazar el envío.

**RF-5 · Aprobación** (HU-2)
- RF-5.1 Cuando recepción o un administrador registra la aprobación del cliente indicando el canal (presencial, teléfono, WhatsApp o correo), el sistema deberá marcar el presupuesto como aprobado y pasar la orden a Aprobada en la misma operación, guardando quién y cuándo.
- RF-5.2 Si el presupuesto no está enviado, entonces el sistema deberá rechazar la decisión.

**RF-6 · Rechazo** (HU-2)
- RF-6.1 Cuando recepción o un administrador registra el rechazo con canal y motivo (3 a 500 caracteres), el sistema deberá marcar el presupuesto como rechazado y cancelar la orden con ese motivo en el historial, en la misma operación.

**RF-7 · Vencimiento** (HU-3)
- RF-7.1 Si se intenta aprobar o rechazar un presupuesto cuyo vencimiento pasó, entonces el sistema deberá marcarlo como vencido, rechazar la decisión e indicar que debe emitirse una nueva versión.
- RF-7.2 El sistema no deberá permitir que un presupuesto vencido, rechazado, reemplazado o aprobado reciba otra decisión.

**RF-8 · Privacidad** (RN-07)
- RF-8.1 Si quien consulta o arma presupuestos es técnico o cliente, entonces el sistema deberá negarle el acceso a los presupuestos.
- RF-8.2 El sistema no deberá mostrar el costo unitario de los repuestos en los presupuestos.

## 5. Requisitos no funcionales

- **RNF-1 Exactitud monetaria:** ningún importe usa decimales flotantes; el total de una vista previa y el del servidor coinciden al centavo.
- **RNF-2 Atomicidad:** la decisión del cliente y el cambio de estado de la orden ocurren juntos o no ocurren.
- **RNF-3 Inmutabilidad del historial:** un presupuesto enviado nunca se modifica ni se borra; se emite otra versión.
- **RNF-4 Trazabilidad:** quién registró cada decisión y por qué canal queda guardado.

## 6. Casos límite

- Presupuesto con el mismo repuesto en dos líneas: cada línea se calcula por separado.
- Total con muchos decimales intermedios (por ejemplo 33,33 × 3): el resultado es exacto.
- Dos recepcionistas deciden el mismo presupuesto a la vez: solo una decisión se aplica.
- Presupuesto enviado y orden ya cancelada por otro camino: la decisión se rechaza por la orden.
- Nueva versión cuando ya hay una enviada: la anterior queda reemplazada y la orden permanece Presupuestada.
- Presupuesto aprobado cuyo vencimiento pasa antes de iniciar la reparación: sigue vigente (el vencimiento solo afecta las decisiones pendientes).

## 7. Fuera de alcance

Descuentos, impuestos, cobro y facturación, firma del cliente, envío automático por WhatsApp o correo, múltiples monedas.

## 8. Criterios de finalización

- [x] RF-1 a RF-8 tienen al menos un test que pasa (salvo los marcados en `specs/verificacion.md`).
- [x] Aprobar con presupuesto vencido falla y lo marca como vencido (unitario y e2e).
- [x] RF-3.1 (versiones reemplazadas) tiene un test.
- [x] RF-6.1 tiene un test e2e de la cancelación atómica.

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** ¿Siete días de validez es lo correcto? ¿Debe avisarse al cliente antes del vencimiento? (SUP-04; hoy el vencimiento solo se marca cuando alguien intenta decidir, ver spec 010).
- **[NECESITA ACLARACIÓN]** ¿Se necesita una tolerancia o aprobación del administrador cuando el total supera cierto monto?
