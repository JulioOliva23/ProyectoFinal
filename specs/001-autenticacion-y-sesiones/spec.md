# Spec 001 · Autenticación y sesiones

**Estado:** Implementada (spec redactada de forma retroactiva el 2026-10-29) · **Reglas:** RN-06, RN-14 · **Supuestos:** SUP-07

## 1. Contexto y objetivo

El servicio técnico maneja datos de clientes, precios y el código de desbloqueo de sus equipos. Solo personas autorizadas deben operar el sistema, cada una con lo que su rol permite, y una sesión robada o abandonada no debe servir indefinidamente.

**Objetivo:** que cada persona entre con su cuenta, mantenga una sesión corta que se renueva sin molestarla, y que el sistema pueda cortarla de inmediato cuando algo sospechoso ocurre.

## 2. Usuarios

| Rol | Qué necesita |
| --- | --- |
| Administrador | Entrar y operar todo el sistema |
| Recepción | Entrar y operar mostrador, presupuestos e inventario |
| Técnico | Entrar y ver solo su trabajo |
| Cliente | Entrar para ver el estado de sus propios equipos |

## 3. Historias de usuario

- **HU-1** Como persona con cuenta, quiero iniciar sesión con usuario y contraseña, para acceder a lo que mi rol permite.
- **HU-2** Como persona con sesión abierta, quiero que se renueve sola mientras trabajo, para no tener que volver a escribir mi contraseña cada pocos minutos.
- **HU-3** Como persona que termina su turno, quiero cerrar sesión y que nadie pueda reutilizarla, para proteger la cuenta.
- **HU-4** Como administrador, quiero que al cambiar el rol o la contraseña de una cuenta sus sesiones anteriores dejen de valer, para que el cambio surta efecto de inmediato.
- **HU-5** Como dueño del negocio, quiero que adivinar contraseñas por fuerza bruta sea impracticable.

## 4. Requisitos funcionales

Notación EARS: *Cuando* (evento) · *Mientras* (estado) · *Si… entonces* (situación no deseada) · *El sistema deberá* (siempre).

**RF-1 · Inicio de sesión** (HU-1)
- RF-1.1 Cuando una persona con cuenta activa envía su usuario y su contraseña correctos, el sistema deberá entregarle una credencial de acceso de corta duración y una credencial de renovación de larga duración.
- RF-1.2 Si el usuario no existe, la cuenta está desactivada o la contraseña es incorrecta, entonces el sistema deberá rechazar el ingreso con el mismo mensaje en los tres casos, sin revelar cuál ocurrió.

**RF-2 · Renovación con rotación** (HU-2)
- RF-2.1 Cuando una persona presenta una credencial de renovación vigente, el sistema deberá entregarle un par nuevo e invalidar la credencial usada.
- RF-2.2 Si se presenta una credencial de renovación que ya fue invalidada, entonces el sistema deberá invalidar todas las sesiones de esa persona y rechazar la solicitud.
- RF-2.3 Si la credencial de renovación es inválida o no puede identificarse, entonces el sistema deberá rechazarla.

**RF-3 · Cierre de sesión** (HU-3)
- RF-3.1 Cuando una persona cierra sesión, el sistema deberá invalidar su credencial de renovación.
- RF-3.2 Cuando se cierra una sesión que ya estaba cerrada, el sistema deberá responder sin error.
- RF-3.3 Si la credencial recibida al cerrar sesión es inválida, entonces el sistema deberá rechazarla.

**RF-4 · Efecto inmediato de los cambios administrativos** (HU-4)
- RF-4.1 Si una cuenta fue modificada por un administrador después de emitida una credencial de renovación, entonces el sistema deberá rechazar esa credencial.
- RF-4.2 Cuando la credencial se emitió después de la modificación, aunque sea en el mismo segundo, el sistema deberá aceptarla.

**RF-5 · Perfil**
- RF-5.1 Cuando una persona con sesión consulta su perfil, el sistema deberá devolver sus datos básicos y su rol, sin ningún dato secreto.

**RF-6 · Protección contra fuerza bruta** (HU-5)
- RF-6.1 Si desde un mismo origen se superan 10 intentos de inicio de sesión en un minuto, entonces el sistema deberá rechazar los siguientes e indicar que debe esperar.

**RF-7 · Acceso por rol**
- RF-7.1 El sistema deberá exigir una sesión válida para toda operación, salvo iniciar sesión, renovar, la consulta pública del cliente y la documentación de la API.
- RF-7.2 Si una petición llega sin sesión válida, entonces el sistema deberá responder "no autenticado".
- RF-7.3 Si la persona tiene sesión pero su rol no permite la operación, entonces el sistema deberá responder "prohibido".

## 5. Requisitos no funcionales

- **RNF-1 Seguridad:** las contraseñas nunca se guardan ni se devuelven en claro.
- **RNF-2 Duración:** la credencial de acceso dura 15 minutos y la de renovación 7 días.
- **RNF-3 Sin filtración:** ningún mensaje de error revela si un usuario existe.
- **RNF-4 Trazabilidad de rol:** el usuario que ejecuta una operación se toma de su sesión, nunca de datos enviados por quien llama.

## 6. Casos límite

- Dos pestañas renuevan con la misma credencial a la vez: la segunda se trata como reutilización (RF-2.2).
- Cuenta desactivada con una sesión todavía vigente: la renovación debe fallar.
- Credencial manipulada o de un formato antiguo sin identificador: se rechaza (RF-2.3).
- Cierre de sesión repetido: no produce error (RF-3.2).

## 7. Fuera de alcance

Recuperación de contraseña por correo, autenticación en dos pasos, inicio de sesión con redes sociales, lista de sesiones activas por persona.

## 8. Criterios de finalización

- [x] RF-1, RF-3, RF-4, RF-5 y RF-7 tienen al menos un test que pasa.
- [ ] RF-2.2 se cumple de verdad: tras detectar reutilización, ninguna credencial anterior sirve (hoy **incumplido**, ver el plan, D1).
- [ ] RF-6.1 tiene un test automatizado.
- [ ] Un usuario inexistente tarda lo mismo que uno con contraseña incorrecta (RNF-3, plan D2).

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** ¿La persona olvida su contraseña? Hoy solo un administrador puede reiniciarla.
- **[NECESITA ACLARACIÓN]** ¿Se necesita un "cerrar todas mis sesiones" iniciado por la propia persona?
- **[NECESITA ACLARACIÓN]** ¿Siete días de sesión es adecuado para el mostrador? (ver también spec 009 sobre dónde se guarda la credencial).
