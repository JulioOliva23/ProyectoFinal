# Banco de preguntas para el cliente

> Este banco es la fuente de numeración de la entrevista. Cada identificador `P-xx` coincide exactamente con el mismo tema e índice en [registro-respuestas-cliente.md](registro-respuestas-cliente.md).
>
> Las preguntas salen de los supuestos abiertos ([supuestos.md](supuestos.md)) y de las reglas de negocio de [AI_CONTEXT.md §4](../AI_CONTEXT.md#4-reglas-de-negocio-rn) que se implementaron sin confirmación explícita. Están ordenadas por los seis escalones de [00-contexto-problema.md](00-contexto-problema.md#los-seis-escalones-para-preguntar).

## Contexto y proceso

### P-01
**¿Cuántos técnicos trabajan en el local y cuántos equipos se reciben por día?**

*Alimenta:* contexto operativo, tamaño de página del listado y carga por técnico.

### P-02
**¿Qué necesita ver cada perfil al entrar al sistema (recepción, técnico, administrador)?**

*Alimenta:* pantallas iniciales por rol (US-00) y navegación del frontend.

### P-03
**¿Cuál es el recorrido exacto de un equipo desde que llega al mostrador hasta que se entrega?**

*Alimenta:* RN-04 y la máquina de estados de la OT.

### P-04
**¿Quién decide qué técnico atiende cada equipo y se puede reasignar a mitad de la reparación?**

*Alimenta:* RN-06 y US-04.

### P-05
**¿Existe un control de calidad formal antes de entregar el equipo? ¿Quién lo hace?**

*Alimenta:* estado `QUALITY_CONTROL`, retrabajo y US-20.

## Reglas y excepciones

### P-06
**¿Se reciben equipos sin IMEI legible (placa muerta, sin caja, IMEI alterado)? ¿Cómo se identifican?**

*Alimenta:* RN-02 y SUP-01.

### P-07
**En equipos dual-SIM, ¿hace falta registrar el segundo IMEI?**

*Alimenta:* RN-13 y SUP-06.

### P-08
**¿Cuántos días es válido un presupuesto? ¿Se avisa al cliente antes de que venza?**

*Alimenta:* RN-08 y SUP-04.

### P-09
**¿El repuesto se descuenta del almacén al empezar la reparación o recién cuando queda instalado?**

*Alimenta:* RN-09 y SUP-02.

### P-10
**¿Qué pasa si al iniciar la reparación no hay stock del repuesto presupuestado?**

*Alimenta:* RN-09, SUP-02 y el bloqueo `422 INSUFFICIENT_STOCK`.

### P-11
**¿Qué pasa si el cliente se arrepiente después de aprobar, o el equipo resulta irreparable durante la reparación?**

*Alimenta:* SUP-08 y liberación de reservas (kardex `RELEASE`).

### P-12
**Si el cliente rechaza el presupuesto, ¿se cobra el diagnóstico?**

*Alimenta:* estado `CANCELLED` y alcance de liquidación (fuera del MVP).

### P-13
**Si durante la reparación aparece una falla que no estaba en el presupuesto, ¿cómo se procede?**

*Alimenta:* versionado de presupuestos (RN-08) y hallazgos adicionales (fuera del MVP).

### P-14
**¿El local ofrece garantía sobre la reparación? ¿De cuántos días y qué cubre?**

*Alimenta:* módulo de garantías (fuera del MVP) y RN-13.

## Permisos y datos

### P-15
**¿Quién puede ver el código de desbloqueo del equipo? ¿Es necesario saber cada vez que alguien lo consulta?**

*Alimenta:* RN-03, SUP-09 y US-07.

### P-16
**¿Qué se hace con el código de desbloqueo cuando el equipo se entrega?**

*Alimenta:* SUP-09 (política de borrado en `DELIVERED`).

### P-17
**¿Los técnicos pueden ver precios de venta o costos de los repuestos?**

*Alimenta:* RN-07.

### P-18
**¿Qué puede consultar el cliente desde el sistema sin llamar al local? ¿Necesita crear una cuenta?**

*Alimenta:* RN-14 y SUP-05.

### P-19
**¿Por qué canales se aprueba hoy un presupuesto (en persona, teléfono, WhatsApp, correo)?**

*Alimenta:* RN-05 y el enum `DecisionChannel`.

### P-20
**¿Durante cuánto tiempo se conserva el historial de reparaciones de un equipo?**

*Alimenta:* RN-12 y RN-13.

### P-21
**¿Se trabaja con una sola moneda? ¿Se emite factura desde el sistema?**

*Alimenta:* RN-15 y SUP-10.

### P-22
**¿Cuál es el stock mínimo de cada repuesto y quién define cuándo reponer?**

*Alimenta:* RN-11 y US-16.

### P-23
**¿Quién puede corregir el inventario cuando el conteo físico no coincide con el sistema?**

*Alimenta:* ajustes de stock (US-14) y permisos de `ADMIN`.

### P-24
**¿Hay más de un local o almacén?**

*Alimenta:* alcance multi-sucursal (no contemplado).
