# Spec 005 · Consulta de órdenes y panel de control

**Estado:** Implementada (spec retroactiva, 2026-10-29) · **Reglas:** RN-06 · **Historia de origen:** US-03 (listado); la búsqueda libre y el resumen del panel los agregó el equipo después, sin historia en el backlog

## 1. Contexto y objetivo

Con decenas de equipos en el local, recepción necesita **encontrar una orden en segundos** (el cliente llega diciendo su nombre, su teléfono o un número de ticket) y saber de un vistazo **cuánto trabajo hay y qué está atrasado**. El técnico, en cambio, solo debe ver su propia cola.

**Objetivo:** listar, filtrar y buscar órdenes, y resumir la carga de trabajo, respetando lo que cada rol puede ver.

## 2. Usuarios

| Rol | Interés |
| --- | --- |
| Recepción y administrador | Buscar cualquier orden y ver el resumen del local |
| Técnico | Ver y buscar únicamente las órdenes asignadas a él |

## 3. Historias de usuario

- **HU-1** Como recepcionista, quiero listar las órdenes por estado y por técnico, para organizar el día.
- **HU-2** Como recepcionista, quiero buscar por número de orden, IMEI, nombre o teléfono, para atender al cliente que está en el mostrador.
- **HU-3** Como técnico, quiero ver solo mis órdenes, para concentrarme en mi trabajo.
- **HU-4** Como administrador, quiero un resumen con las órdenes activas, las atrasadas y el conteo por estado, para decidir dónde reforzar.

## 4. Requisitos funcionales

**RF-1 · Listado paginado** (HU-1)
- RF-1.1 Cuando el personal consulta las órdenes, el sistema deberá devolver una página con los datos, el total, el número de página y su tamaño, de la más reciente a la más antigua.
- RF-1.2 Cuando se indica un estado, el sistema deberá devolver solo las órdenes en ese estado.
- RF-1.3 Cuando recepción o un administrador indica un técnico, el sistema deberá devolver solo las órdenes asignadas a él.

**RF-2 · Búsqueda libre** (HU-2)
- RF-2.1 Cuando se escribe un texto, el sistema deberá buscar, sin distinguir mayúsculas y por coincidencia parcial, en IMEI, nombre del cliente y teléfono.
- RF-2.2 Cuando el texto se lee como número de orden ("OT-000123" o "123"), el sistema deberá además buscar esa orden por su número.
- RF-2.3 Si el texto está vacío o solo tiene espacios, entonces el sistema deberá ignorarlo y no filtrar.
- RF-2.4 Si el texto es un número mayor al que puede ser un número de orden, entonces el sistema deberá tratarlo solo como texto, sin fallar.
- RF-2.5 El sistema deberá aceptar textos de hasta 100 caracteres y rechazar los más largos.

**RF-3 · Alcance del técnico** (HU-3)
- RF-3.1 Mientras quien consulta sea técnico, el sistema deberá limitar el listado, la búsqueda y los filtros a sus órdenes asignadas, ignorando cualquier técnico indicado en la consulta.

**RF-4 · Resumen del panel** (HU-4)
- RF-4.1 Cuando recepción o un administrador pide el resumen, el sistema deberá devolver el número de órdenes activas (todas salvo Entregadas y Canceladas).
- RF-4.2 El sistema deberá devolver el número de órdenes atrasadas: activas cuya fecha compromiso ya pasó, **sin contar** las que están Listas para entrega (la reparación terminó; solo falta que el cliente venga).
- RF-4.3 El sistema deberá devolver el conteo por cada uno de los nueve estados, incluyendo los que tienen cero.
- RF-4.4 Si quien pide el resumen es técnico o cliente, entonces el sistema deberá negarlo.

**RF-5 · Detalle** (HU-1, HU-3)
- RF-5.1 Cuando el personal consulta una orden que puede ver, el sistema deberá devolver sus datos, el equipo, el cliente, el técnico, las transiciones permitidas a quien consulta y si tiene código de desbloqueo (nunca el código).
- RF-5.2 Si la orden no existe, entonces el sistema deberá responder "no encontrada".

## 5. Requisitos no funcionales

- **RNF-1 Rendimiento:** el listado se entrega paginado y el resumen se calcula con conteos agrupados, para que respondan de forma interactiva *(sin medición de carga todavía)*.
- **RNF-2 Privacidad:** el listado nunca incluye el código de desbloqueo ni precios internos.
- **RNF-3 Coherencia:** el resumen no cuenta una orden como activa y atrasada si el estado cambió a mitad de la consulta (se aceptan diferencias momentáneas).

## 6. Casos límite

- Búsqueda "123" que coincide con el número de orden 123 y también con un teléfono que contiene "123": ambas aparecen.
- Búsqueda con un número gigante (`99999999999`): se trata como texto, sin error.
- Página más allá del último resultado: lista vacía con el total correcto.
- Técnico que filtra por otro técnico: su consulta se ignora y ve solo lo suyo.
- Orden sin fecha compromiso: nunca figura como atrasada.

## 7. Fuera de alcance

Exportar a hoja de cálculo, búsqueda por rango de fechas, ordenamiento a elección, guardar búsquedas, gráficos históricos.

## 8. Criterios de finalización

- [x] RF-1 a RF-5 tienen al menos un test que pasa.
- [x] RF-5.1 tiene un test que comprueba que el detalle nunca contiene el código ni su cifrado.
- [x] RF-1.1 tiene un test de página fuera de rango.

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** ¿El resumen debe poder filtrarse por técnico o por rango de fechas?
- **[NECESITA ACLARACIÓN]** ¿"Atrasada" debe considerar también las Listas para entrega después de cierto tiempo sin retiro?
