# Spec 002 · Gestión de usuarios

**Estado:** Implementada (spec retroactiva, 2026-10-29) · **Reglas:** RN-06, RN-14 · **Historia de origen:** US-21

## 1. Contexto y objetivo

El personal del servicio técnico cambia: entra gente nueva, alguien cambia de puesto, otra persona se va. Hace falta que el administrador pueda crear, ajustar y dar de baja cuentas sin tocar la base de datos, y sin poder dejar al negocio sin acceso por error.

**Objetivo:** administrar cuentas de personal y de clientes con reglas que impidan los errores más costosos (bloquearse a uno mismo, convertir personal en cliente o al revés).

## 2. Usuarios

| Rol | Interés |
| --- | --- |
| Administrador | Crea, edita, reinicia contraseñas, desactiva y reactiva cuentas |
| Recepción | Consulta la lista de personas activas (por ejemplo, para elegir un técnico) |
| Técnico | Es el destinatario de asignaciones; no gestiona cuentas |

## 3. Historias de usuario

- **HU-1** Como administrador, quiero crear una cuenta con rol, para que una persona nueva pueda trabajar.
- **HU-2** Como administrador, quiero corregir el nombre o el rol de una cuenta, para reflejar un cambio de puesto.
- **HU-3** Como administrador, quiero reiniciar la contraseña de alguien, para recuperar el acceso de quien la olvidó.
- **HU-4** Como administrador, quiero desactivar y reactivar cuentas sin borrarlas, para conservar el historial de lo que hicieron.
- **HU-5** Como recepcionista, quiero ver a los técnicos activos, para asignarles órdenes.

## 4. Requisitos funcionales

**RF-1 · Alta de cuenta** (HU-1)
- RF-1.1 Cuando un administrador crea una cuenta con usuario, contraseña, nombre y rol válidos, el sistema deberá registrarla como activa y devolver sus datos sin la contraseña.
- RF-1.2 El sistema deberá aceptar solo usuarios de 3 a 80 caracteres con minúsculas, dígitos, punto, guion o guion bajo.
- RF-1.3 El sistema deberá exigir contraseñas de 10 a 128 caracteres con al menos una minúscula, una mayúscula y un dígito.
- RF-1.4 Si el nombre de usuario ya existe, entonces el sistema deberá rechazar el alta indicando que está ocupado.
- RF-1.5 Mientras el rol sea Cliente, el sistema deberá exigir que la cuenta quede vinculada a un cliente existente; si el cliente no existe, entonces deberá rechazar el alta.
- RF-1.6 Si una cuenta de personal (administrador, recepción, técnico) se intenta vincular a un cliente, entonces el sistema deberá rechazarla.

**RF-2 · Consulta** (HU-5)
- RF-2.1 Cuando un administrador o recepcionista consulta las cuentas, el sistema deberá listar las activas, con opción de filtrar por rol.
- RF-2.2 Cuando quien consulta es administrador y lo solicita, el sistema deberá incluir también las cuentas desactivadas; para los demás roles nunca deberá incluirlas.

**RF-3 · Edición** (HU-2)
- RF-3.1 Cuando un administrador cambia el nombre o el rol de una cuenta de personal, el sistema deberá guardar el cambio.
- RF-3.2 Si se intenta convertir personal en cliente o un cliente en personal, entonces el sistema deberá rechazar el cambio.
- RF-3.3 Si un administrador intenta cambiar su propio rol, entonces el sistema deberá rechazarlo; sí podrá cambiar su propio nombre.
- RF-3.4 Si la cuenta no existe, entonces el sistema deberá responder "no encontrada".

**RF-4 · Reinicio de contraseña** (HU-3)
- RF-4.1 Cuando un administrador reinicia la contraseña de una cuenta, el sistema deberá aplicar las mismas reglas de RF-1.3 y guardar solo la nueva, de forma irrecuperable.
- RF-4.2 Cuando se reinicia la contraseña, el sistema deberá dejar sin efecto las sesiones anteriores de esa cuenta (spec 001, RF-4).

**RF-5 · Desactivación y reactivación** (HU-4)
- RF-5.1 Cuando un administrador desactiva una cuenta, el sistema deberá marcarla como inactiva sin borrarla.
- RF-5.2 Si un administrador intenta desactivar su propia cuenta, entonces el sistema deberá rechazarlo.
- RF-5.3 Si la cuenta ya estaba inactiva, entonces el sistema deberá responder "no encontrada".
- RF-5.4 Cuando un administrador reactiva una cuenta, el sistema deberá marcarla como activa; reactivar una cuenta ya activa no deberá producir error.

**RF-6 · Asignables** (HU-5)
- RF-6.1 El sistema deberá considerar asignable a una orden solo a una cuenta activa con rol Técnico; en cualquier otro caso deberá rechazar la asignación.

## 5. Requisitos no funcionales

- **RNF-1** Ninguna respuesta incluye contraseñas ni su huella.
- **RNF-2** Solo el administrador puede crear, editar, reiniciar contraseñas, desactivar y reactivar.
- **RNF-3** Todo mensaje de error destinado a la persona usuaria debe estar en español *(hoy no se cumple, ver dudas)*.

## 6. Casos límite

- Un administrador desactiva a otro administrador, y este a su vez al primero: el negocio podría quedar sin administradores activos (RF-5.2 solo protege la cuenta propia).
- Una cuenta desactivada conserva su acceso hasta que expire la credencial de acceso vigente (hasta 15 minutos); la renovación sí falla de inmediato.
- Nombre de usuario con mayúsculas: se rechaza.
- Reactivar una cuenta que nunca estuvo inactiva: respuesta correcta, sin cambios.

## 7. Fuera de alcance

Autorregistro, importación masiva, roles personalizados, borrado definitivo de cuentas, fotos de perfil.

## 8. Criterios de finalización

- [x] RF-1 a RF-6 tienen al menos un test que pasa.
- [x] Una cuenta nunca se borra: solo se desactiva.
- [ ] Los mensajes de error de este módulo están en español (RNF-3; conflicto con la constitución, C6.2).

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** ¿Debe impedirse desactivar al último administrador activo (no solo a uno mismo)?
- **[NECESITA ACLARACIÓN]** ¿La desactivación debe cortar también la credencial de acceso vigente, o basta con los 15 minutos?
- **[NECESITA ACLARACIÓN]** ¿Los mensajes del servidor se traducen en el servidor o los traduce la interfaz?
