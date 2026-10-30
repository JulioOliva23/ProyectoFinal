# Spec 003 · Recepción del equipo y registro de dispositivos

**Estado:** Implementada (spec retroactiva, 2026-10-29) · **Reglas:** RN-01, RN-02, RN-03, RN-13, SUP-01, SUP-06, SUP-09 · **Historias de origen:** US-01, US-02, US-21

## 1. Contexto y objetivo

Cuando alguien deja un celular, el local necesita dejar constancia de **qué entró, en qué estado y de quién es**, para no discutir después por una pantalla rayada o por una batería que "ya estaba así". Además necesita reconocer equipos que ya pasaron por el taller y proteger el código de desbloqueo que el cliente confía.

**Objetivo:** que en el mostrador una sola operación registre cliente, equipo y estado físico, y abra la orden de trabajo, de forma segura y sin duplicar datos.

## 2. Usuarios

| Rol | Interés |
| --- | --- |
| Recepción | Registra equipos y abre órdenes en el mostrador |
| Administrador | Lo mismo, y además mantiene el catálogo de modelos |
| Técnico | Consulta el historial de un equipo y el catálogo de modelos |

## 3. Historias de usuario

- **HU-1** Como recepcionista, quiero registrar un equipo con su IMEI, para identificarlo sin ambigüedad.
- **HU-2** Como recepcionista, quiero anotar el estado físico por zonas, para tener respaldo ante reclamos.
- **HU-3** Como cliente, quiero que mi código de desbloqueo quede protegido, para confiar mi equipo.
- **HU-4** Como recepcionista, quiero ver las reparaciones previas de un equipo al ingresar su IMEI, para dar contexto al técnico.
- **HU-5** Como administrador, quiero mantener el catálogo de marcas y modelos, para que el mostrador elija de una lista confiable.

## 4. Requisitos funcionales

**RF-1 · IMEI válido** (HU-1)
- RF-1.1 El sistema deberá aceptar como IMEI solo 15 dígitos cuyo último dígito sea el verificador correcto de los 14 anteriores.
- RF-1.2 Cuando el IMEI se escribe con espacios o guiones, el sistema deberá normalizarlo antes de validarlo y guardarlo.
- RF-1.3 Si el IMEI tiene longitud distinta de 15, contiene letras o su dígito verificador no coincide, entonces el sistema deberá rechazar el registro con un mensaje que indique el motivo.

**RF-2 · Apertura de la orden** (HU-1, HU-2)
- RF-2.1 Cuando recepción o un administrador registra cliente, equipo y estado, el sistema deberá crear la orden de trabajo con un número correlativo, en estado "Ingresado".
- RF-2.2 El sistema deberá registrar cliente, equipo y orden como una sola operación: si algo falla, no deberá quedar ninguno.
- RF-2.3 El sistema deberá guardar quién recibió el equipo a partir de la sesión, nunca de datos enviados.

**RF-3 · Datos de la orden** (HU-2)
- RF-3.1 El sistema deberá exigir el problema reportado (5 a 1000 caracteres) y el tipo de bloqueo (ninguno, PIN, patrón o contraseña).
- RF-3.2 El sistema deberá registrar el estado de cada zona del equipo con una condición entre OK, rayado, fisurado, abollado o faltante, y notas opcionales de hasta 500 caracteres.
- RF-3.3 Cuando se informa el nivel de batería, el sistema deberá aceptar solo valores de 0 a 100; es opcional porque el equipo puede no encender.
- RF-3.4 Cuando se informa una fecha compromiso, el sistema deberá exigir que sea futura.
- RF-3.5 Si la solicitud incluye campos desconocidos, entonces el sistema deberá rechazarla.
- RF-3.6 El sistema deberá exigir datos del cliente: documento (4 a 50), nombre (3 a 150), y opcionalmente teléfono y correo válidos.

**RF-4 · Código de desbloqueo protegido** (HU-3)
- RF-4.1 Mientras el tipo de bloqueo no sea "ninguno", el sistema deberá exigir un código coherente con el tipo (PIN numérico, patrón o contraseña).
- RF-4.2 El sistema deberá guardar el código únicamente cifrado, de forma que pueda recuperarse para el técnico autorizado.
- RF-4.3 El sistema no deberá devolver ni registrar el código en ninguna respuesta, listado ni bitácora de errores.

**RF-5 · Historial por IMEI** (HU-4)
- RF-5.1 Cuando se consulta un IMEI registrado, el sistema deberá devolver el equipo, su modelo, su dueño actual y todas sus órdenes previas con estado, problema, diagnóstico, técnico y fechas.
- RF-5.2 Si el IMEI no está registrado, entonces el sistema deberá responder "no encontrado".

**RF-6 · Un equipo, un IMEI, un modelo** (HU-1)
- RF-6.1 Cuando el IMEI ya está registrado con el mismo modelo, el sistema deberá reutilizar el equipo y conservar su historial.
- RF-6.2 Si el IMEI ya está registrado con otro modelo, entonces el sistema deberá rechazar el ingreso por conflicto.
- RF-6.3 Cuando el equipo ya conocido llega con otro dueño (reventa), el sistema deberá transferirlo al nuevo cliente conservando su historial.
- RF-6.4 Si el modelo no existe o está inactivo, entonces el sistema deberá rechazar el ingreso.

**RF-7 · Catálogo de modelos** (HU-5)
- RF-7.1 Cuando un administrador crea un modelo, el sistema deberá aceptarlo solo si la pareja marca + modelo no existe, sin distinguir mayúsculas.
- RF-7.2 Cuando un administrador renombra un modelo, el sistema deberá permitirlo salvo que el nuevo nombre pertenezca a otro modelo; cambiar solo mayúsculas del mismo modelo es válido.
- RF-7.3 Cuando un administrador activa o desactiva un modelo, el sistema deberá hacerlo sin revisar el nombre y sin perder los equipos ni el historial asociados.
- RF-7.4 Si el modelo no existe, entonces el sistema deberá responder "no encontrado".
- RF-7.5 El sistema deberá listar los modelos activos al personal e incluir los inactivos solo al administrador.

## 5. Requisitos no funcionales

- **RNF-1 Confidencialidad:** el código de desbloqueo no es legible desde la base de datos ni desde ninguna respuesta.
- **RNF-2 Integridad:** el IMEI es único en todo el sistema.
- **RNF-3 Usabilidad:** los mensajes de IMEI inválido explican qué revisar ("marque *#06# o revise la bandeja SIM").
- **RNF-4 Permisos:** solo administración y recepción abren órdenes; solo administración edita el catálogo.

## 6. Casos límite

- IMEI de 14 o 16 dígitos, con letras o todo ceros con verificador incorrecto.
- Mismo IMEI escrito con y sin separadores: es el mismo equipo.
- Cliente que ya existe (mismo documento): se reutiliza, no se duplica, y sus datos de contacto se actualizan con los del ingreso más reciente.
- Equipo que no enciende: batería vacía y sin código de desbloqueo.
- Dos recepcionistas registran el mismo IMEI nuevo a la vez: el segundo ve conflicto, no un duplicado.
- Modelo desactivado a mitad de la recepción: el registro se rechaza.

## 7. Fuera de alcance

Fotos del equipo, firma digital del cliente, segundo IMEI (dual SIM), lectura del IMEI por cámara o código de barras, impresión del ticket desde el servidor.

## 8. Criterios de finalización

- [x] RF-1 a RF-7 tienen al menos un test que pasa.
- [x] Ningún test e2e encuentra el código de desbloqueo en claro.
- [x] RF-2.2 (atomicidad) tiene un test que provoca un conflicto a mitad y comprueba que no queda nada.

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** ¿Se reciben equipos sin IMEI legible (placa muerta, sin caja)? Hoy no pueden registrarse (SUP-01).
- **[NECESITA ACLARACIÓN]** ¿Hay que registrar el segundo IMEI de los equipos con dos SIM? (SUP-06).
- **[NECESITA ACLARACIÓN]** ¿Qué pasa con el código de desbloqueo cuando el equipo se entrega? Hoy se conserva cifrado indefinidamente (SUP-09).
