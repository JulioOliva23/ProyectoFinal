# Spec 008 · Seguimiento del equipo por el cliente

**Estado:** Implementada (spec retroactiva, 2026-10-29) · **Reglas:** RN-03, RN-14 · **Supuesto confirmado:** SUP-05 · **Historias de origen:** US-17, US-18, US-19

## 1. Contexto y objetivo

El cliente que deja su celular llama o vuelve al local solo para preguntar "¿ya está?". Eso consume tiempo del mostrador y genera molestia. Pero el estado de una reparación es información privada: no puede ser consultable por cualquiera que adivine un número.

**Objetivo:** que el cliente consulte el estado de su equipo cuando quiera, sin llamar y sin crear una cuenta, mostrándole solo lo que le corresponde, y que nadie pueda curiosear órdenes ajenas.

## 2. Usuarios

| Rol | Interés |
| --- | --- |
| Cliente sin cuenta | Consulta su equipo con el número de orden y el código de su ticket |
| Cliente con cuenta | Ve todas sus órdenes iniciando sesión |
| Recepción y administrador | Entregan el ticket y reponen el código si se pierde |

## 3. Historias de usuario

- **HU-1** Como cliente, quiero ver el estado de mi equipo con los datos del ticket, para no tener que llamar.
- **HU-2** Como cliente frecuente, quiero iniciar sesión y ver todos mis equipos, para no buscar mis tickets.
- **HU-3** Como cliente que perdió el ticket, quiero que el local me dé uno nuevo, sin que el viejo siga sirviendo.
- **HU-4** Como dueño, quiero que sea impracticable adivinar códigos de otros clientes.

## 4. Requisitos funcionales

**RF-1 · Código de seguimiento** (HU-1, HU-4)
- RF-1.1 Cuando se abre una orden, el sistema deberá generar un código de seguimiento aleatorio de 8 caracteres tomados de un alfabeto sin caracteres confundibles (sin 0/O ni 1/I/L).
- RF-1.2 El sistema deberá devolver el código completo **una sola vez**, al abrir la orden, con formato `ABCD-EFGH` para el ticket.
- RF-1.3 El sistema deberá guardar el código solo de forma irrecuperable; no deberá poder mostrarse de nuevo.
- RF-1.4 El sistema deberá asegurar que el código de seguimiento nunca coincida con el código de desbloqueo del equipo.

**RF-2 · Consulta sin cuenta** (HU-1)
- RF-2.1 Cuando una persona ingresa un número de orden y un código de seguimiento correctos, el sistema deberá devolver el estado de esa orden sin requerir sesión.
- RF-2.2 El sistema deberá aceptar el número como "OT-000123", "000123" o "123", y el código con o sin guion y en mayúsculas o minúsculas.
- RF-2.3 El sistema deberá rechazar códigos que no tengan el formato del ticket (por ejemplo, un PIN de 4 dígitos) sin consultar ninguna orden.

**RF-3 · Respuesta uniforme** (HU-4)
- RF-3.1 Si el número no existe o el código es incorrecto, entonces el sistema deberá responder exactamente lo mismo en ambos casos ("no encontrada o código inválido").
- RF-3.2 El sistema no deberá permitir deducir por el tiempo de respuesta qué números de orden existen.
- RF-3.3 Si la orden es anterior a la existencia del código y no tiene uno, entonces el sistema deberá tratarla como no encontrada.

**RF-4 · Límite de intentos** (HU-4)
- RF-4.1 Si desde un mismo origen se superan 5 consultas por minuto, entonces el sistema deberá rechazar las siguientes e indicar que debe esperar.

**RF-5 · Lo que ve el cliente** (HU-1, HU-2)
- RF-5.1 El sistema deberá mostrar al cliente únicamente: número de orden, equipo (marca y modelo), estado con su etiqueta en español, fecha compromiso, total del presupuesto vigente y fecha de última actualización.
- RF-5.2 El sistema no deberá mostrar al cliente costos internos, código de desbloqueo, diagnóstico técnico ni notas, y la forma de la respuesta deberá ser la misma con o sin cuenta.

**RF-6 · Reposición del código** (HU-3)
- RF-6.1 Cuando recepción o un administrador pide un código nuevo para una orden, el sistema deberá generarlo, devolverlo una vez e invalidar el anterior en el mismo momento.
- RF-6.2 El sistema deberá asegurar que el nuevo código tampoco coincida con el código de desbloqueo.

**RF-7 · Consulta con cuenta de cliente** (HU-2)
- RF-7.1 Cuando un cliente con sesión consulta sus órdenes, el sistema deberá listar todas las suyas, incluidas las canceladas, con la misma vista del RF-5.
- RF-7.2 Si una cuenta de cliente no está vinculada a un cliente, entonces el sistema deberá rechazar la consulta.
- RF-7.3 Si un cliente intenta ver una orden ajena por su identificador, entonces el sistema deberá responder "no encontrada", sin confirmar que existe.
- RF-7.4 Si un cliente intenta usar una operación del personal, entonces el sistema deberá negarla.

## 5. Requisitos no funcionales

- **RNF-1 Seguridad:** con 31 símbolos y 8 posiciones hay unas 8,5·10¹¹ combinaciones; junto con el límite de 5 intentos por minuto hace inviable adivinar un código.
- **RNF-2 Privacidad:** la consulta pública no revela si una orden existe.
- **RNF-3 Disponibilidad:** la consulta funciona sin sesión y sin depender de datos del personal.

## 6. Casos límite

- Cliente escribe el código con espacios, minúsculas o el guion en otro lugar: se normaliza.
- Código de 4 dígitos (parecido a un PIN de celular): se rechaza antes de buscar.
- Mismo código en dos órdenes distintas: no confirma otra orden, el número manda.
- Orden creada antes del código: no consultable hasta que recepción reponga uno.
- Reponer el código dos veces seguidas: solo el último sirve.
- Orden entregada o cancelada: sigue siendo consultable.
- Número de orden con 11 dígitos o negativo: se rechaza.

## 7. Fuera de alcance

Notificaciones automáticas por WhatsApp o correo, códigos QR, que el cliente cambie su propio código, historial de estados visible al cliente, chat con el taller.

## 8. Criterios de finalización

- [x] RF-1 a RF-7 tienen al menos un test que pasa.
- [x] El límite de intentos se prueba con el sexto intento rechazado.
- [ ] RF-3.2 (tiempo de respuesta) tiene una medición o un test que lo compruebe.
- [ ] RF-5.2 tiene un test que compruebe que la respuesta no contiene campos internos.

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** ¿El código de seguimiento debe caducar al entregar el equipo?
- **[NECESITA ACLARACIÓN]** ¿La consulta pública debe mostrar el historial de estados (con fechas) o solo el actual?
