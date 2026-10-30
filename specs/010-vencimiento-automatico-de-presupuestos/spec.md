# Spec 010 · Vencimiento automático de presupuestos

**Estado:** Propuesta · **Reglas:** RN-08 · **Supuesto:** SUP-04 (pendiente técnico) · **Historia de origen:** US-12

## 1. Contexto y objetivo

Un presupuesto vence porque los precios de los repuestos cambian con el dólar. Hoy el sistema solo **se entera** de que venció cuando alguien intenta aprobarlo o rechazarlo. Mientras tanto el presupuesto figura como "enviado" y la orden sigue como "presupuestada", aunque ya nadie podría aprobarla. Recepción no tiene cómo ver qué ofertas murieron ni a quién llamar.

**Objetivo:** que el estado de un presupuesto refleje la realidad en todo momento y que recepción pueda actuar a tiempo sobre los que están por vencer o ya vencieron.

## 2. Usuarios

| Rol | Interés |
| --- | --- |
| Recepción | Saber a quién llamar antes de que venza un presupuesto y reemitir los vencidos |
| Administrador | Ver cuántas ofertas se pierden por no responder a tiempo |

## 3. Historias de usuario

- **HU-1** Como recepcionista, quiero que un presupuesto vencido figure como vencido sin que nadie lo toque, para no confiar en un precio que ya no vale.
- **HU-2** Como recepcionista, quiero ver los presupuestos que vencen en los próximos días, para insistirle al cliente a tiempo.
- **HU-3** Como administrador, quiero que el vencimiento deje rastro en el historial, para saber qué ofertas se perdieron.

## 4. Requisitos funcionales

**RF-1 · Estado real**
- RF-1.1 Cuando llega la fecha de vencimiento de un presupuesto enviado y sin decisión, el sistema deberá considerarlo vencido a partir de ese instante, sin esperar a que alguien intente decidirlo.
- RF-1.2 Cuando el personal consulta un presupuesto o una lista de ellos, el sistema deberá mostrar el estado real, es decir, "vencido" si su fecha ya pasó.
- RF-1.3 El sistema no deberá modificar presupuestos aprobados, rechazados o reemplazados.

**RF-2 · Presupuestos por vencer**
- RF-2.1 Cuando recepción o un administrador pide los presupuestos por vencer, el sistema deberá devolver los enviados sin decisión cuyo vencimiento ocurra dentro de un número de días indicado (por defecto, 2), con los días restantes.
- RF-2.2 El sistema deberá incluir en el resumen del panel la cantidad de presupuestos vencidos sin reemitir.

**RF-3 · Consecuencias sobre la orden**
- RF-3.1 Mientras la orden esté Presupuestada y su presupuesto vigente haya vencido, el sistema deberá permitir emitir una nueva versión (spec 006).
- RF-3.2 El sistema no deberá cancelar ni mover la orden de forma automática por el solo hecho del vencimiento. *(Sujeto a la duda abierta 1.)*

**RF-4 · Rastro**
- RF-4.1 Cuando un presupuesto pasa a vencido de forma automática, el sistema deberá dejar constancia con fecha y la marca de "automático" (sin atribuirlo a una persona).

## 5. Requisitos no funcionales

- **RNF-1 Sin dependencia de un proceso siempre activo:** el hosting gratuito apaga el servidor tras 15 minutos sin tráfico; el estado correcto no puede depender de un reloj interno que ese apagado detenga.
- **RNF-2 Coherencia:** el estado mostrado y el que valida la aprobación coinciden siempre.
- **RNF-3 Costo:** no requiere infraestructura adicional.

## 6. Casos límite

- El servidor estuvo dormido en el instante del vencimiento: al despertar, el estado real se calcula igual.
- Presupuesto que vence mientras alguien lo está aprobando: se aplica la regla de la spec 006 (RF-7.1).
- Cambio de la validez (de 7 a 10 días) después de enviar: los ya enviados conservan su fecha.
- Huso horario: el vencimiento se compara contra el reloj del servidor, no del navegador.

## 7. Fuera de alcance

Avisos automáticos al cliente por WhatsApp o correo, ampliar la vigencia de un presupuesto ya enviado, cancelación automática de órdenes.

## 8. Criterios de finalización

- [ ] Un presupuesto enviado cuya fecha pasó se consulta como vencido sin que nadie intente decidirlo.
- [ ] La lista de "por vencer" devuelve los esperados en un test con fechas controladas.
- [ ] No hay ninguna tarea programada que requiera mantener el servidor despierto.
- [ ] La duda abierta 1 está respondida.

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** (1) Cuando vence el presupuesto, ¿la orden debe seguir Presupuestada esperando una nueva oferta, o cancelarse tras cierto plazo?
- **[NECESITA ACLARACIÓN]** (2) ¿Con cuántos días de anticipación debe alertarse a recepción?
- **[NECESITA ACLARACIÓN]** (3) ¿Quién figura como autor del cambio automático en el historial?
