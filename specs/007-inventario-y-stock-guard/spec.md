# Spec 007 · Inventario de repuestos y Stock Guard

**Estado:** Implementada (spec retroactiva, 2026-10-29) · **Reglas:** RN-07, RN-09, RN-10, RN-11, RN-15 · **Supuestos:** SUP-02, SUP-08 · **Historias de origen:** US-13 a US-16

## 1. Contexto y objetivo

Una reparación no puede empezar si falta la pieza: el técnico desarmaría un equipo que no puede terminar. Además, el dueño necesita saber **cuándo reponer** y **quién movió cada pieza**, porque las pantallas y baterías son caras y se extravían.

**Objetivo:** llevar el catálogo y las existencias de repuestos, reservar las piezas de una reparación en el momento justo, avisar cuando quedan pocas y dejar un registro permanente de cada movimiento.

## 2. Usuarios

| Rol | Interés |
| --- | --- |
| Administrador | Gestiona el catálogo, ve costos y hace ajustes |
| Recepción | Registra llegadas de repuestos y ve alertas; no ve costos |
| Técnico | Consulta compatibilidad y existencias; **no ve precios** |

## 3. Historias de usuario

- **HU-1** Como administrador, quiero dar de alta repuestos con su compatibilidad, para presupuestar solo piezas que sirven.
- **HU-2** Como recepcionista, quiero registrar la llegada de repuestos, para que el stock refleje la realidad.
- **HU-3** Como administrador, quiero corregir mermas con un motivo, para que el inventario cuadre.
- **HU-4** Como técnico, quiero saber al iniciar la reparación si faltan piezas, para no desarmar el equipo en vano.
- **HU-5** Como recepcionista, quiero ver qué repuestos están por agotarse, para reponer a tiempo.

## 4. Requisitos funcionales

**RF-1 · Catálogo** (HU-1)
- RF-1.1 Cuando un administrador da de alta un repuesto, el sistema deberá exigir SKU único de 3 a 50 caracteres (mayúsculas, dígitos y guiones), nombre de 3 a 150, categoría, costo, precio de taller, stock mínimo de 0 a 10 000 y, opcionalmente, hasta 200 modelos compatibles.
- RF-1.2 El sistema deberá ofrecer las categorías: pantalla OLED, pantalla LCD, batería, flex de carga, módulo de cámara, componente SMD, circuito integrado y otros.
- RF-1.3 Cuando un administrador edita un repuesto, el sistema deberá permitir cambiar todo menos el SKU, incluida la lista de modelos compatibles.
- RF-1.4 Cuando un administrador da de baja un repuesto, el sistema deberá desactivarlo sin borrarlo.
- RF-1.5 Si el repuesto tiene unidades reservadas para órdenes, entonces el sistema deberá rechazar la baja.
- RF-1.6 Si algún modelo compatible indicado no existe, entonces el sistema deberá rechazar el alta o la edición.

**RF-2 · Consulta** (HU-1)
- RF-2.1 Cuando el personal consulta el catálogo, el sistema deberá permitir filtrar por categoría, por modelo compatible y por texto (hasta 80 caracteres), con paginación.
- RF-2.2 El sistema deberá mostrar el costo unitario solo a administradores.
- RF-2.3 El sistema deberá ocultar el precio de taller a los técnicos.
- RF-2.4 Cada repuesto deberá mostrar stock físico, reservado, disponible, mínimo y si está en alerta.

**RF-3 · Entradas y ajustes** (HU-2, HU-3)
- RF-3.1 Cuando recepción o un administrador registra una entrada de 1 a 10 000 unidades, el sistema deberá sumarlas al stock y dejar un registro en el kardex en la misma operación.
- RF-3.2 Cuando un administrador registra un ajuste con motivo, el sistema deberá sumar o restar unidades y dejar un registro en el kardex.
- RF-3.3 Si un ajuste negativo excede el stock disponible (el no reservado), entonces el sistema deberá rechazarlo.

**RF-4 · Invariante de existencias** (HU-3)
- RF-4.1 El sistema deberá mantener siempre: disponible = físico − reservado, y nunca negativo, sin importar cuántas operaciones ocurran a la vez.

**RF-5 · Reserva al reparar (Stock Guard)** (HU-4)
- RF-5.1 Cuando una orden pasa a En reparación, el sistema deberá reservar, de forma indivisible, todas las unidades de repuesto del presupuesto aprobado.
- RF-5.2 Si falta stock de al menos un repuesto, entonces el sistema deberá rechazar el paso a reparación, deshacer cualquier reserva ya hecha e informar todos los repuestos faltantes.
- RF-5.3 Cuando una orden pasa a Control de calidad, el sistema deberá descontar del stock físico y del reservado las unidades reservadas.
- RF-5.4 Si dos órdenes compiten por la última unidad, entonces el sistema deberá dejar entrar a reparación solo a una.

**RF-6 · Alertas** (HU-5)
- RF-6.1 Cuando recepción o un administrador consulta las alertas, el sistema deberá listar los repuestos activos cuyo stock disponible sea menor o igual al mínimo.

**RF-7 · Kardex** (HU-3)
- RF-7.1 El sistema deberá registrar cada movimiento (entrada, reserva, liberación, salida, ajuste) con repuesto, persona, cantidad, motivo y fecha.
- RF-7.2 El sistema no deberá permitir modificar ni borrar el kardex.

## 5. Requisitos no funcionales

- **RNF-1 Concurrencia:** ninguna combinación de operaciones simultáneas deja el stock negativo ni vende dos veces la misma unidad.
- **RNF-2 Atomicidad:** un movimiento de stock y su registro en el kardex ocurren juntos o no ocurren.
- **RNF-3 Confidencialidad de costos:** el costo y el precio se muestran solo a quien corresponde (RN-07).
- **RNF-4 Exactitud monetaria:** costo y precio con dos decimales, sin flotantes.

## 6. Casos límite

- Pantalla con stock 1 pedida por dos órdenes a la vez: una entra, la otra queda en Aprobada con aviso (RF-5.4).
- Presupuesto que incluye el mismo repuesto dos veces: se reserva la suma.
- Retrabajo de control de calidad: no reserva ni descuenta de nuevo (spec 004).
- Ajuste negativo igual al disponible: permitido; mayor: rechazado.
- Repuesto dado de baja con presupuestos pendientes: la reserva falla (el repuesto ya no está activo).
- Stock mínimo cero: la alerta salta solo cuando el disponible llega a cero.

## 7. Fuera de alcance

Liberación de reservas al cancelar (SUP-08), órdenes de compra a proveedores, lotes y fechas de caducidad, ubicaciones de almacén, conteo físico guiado.

## 8. Criterios de finalización

- [x] RF-1 a RF-7 tienen al menos un test que pasa (salvo los marcados en `specs/verificacion.md`).
- [x] La competencia por la última unidad se prueba contra una base de datos real (prueba extremo a extremo, ejecutada el 2026-10-29).
- [x] RF-7.2 tiene un test que intenta modificar el kardex.
- [x] RF-1.1 tiene un test de validación del SKU.

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** ¿El descuento físico debe ocurrir al iniciar la reparación (requisito contable) o basta con la reserva y el descuento en control de calidad? (SUP-02).
- **[NECESITA ACLARACIÓN]** ¿Qué pasa con las piezas reservadas si la reparación se interrumpe o el equipo resulta irreparable? (SUP-08).
- **[NECESITA ACLARACIÓN]** ¿Un repuesto compatible con muchos modelos necesita edición masiva?
