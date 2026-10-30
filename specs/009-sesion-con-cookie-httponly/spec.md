# Spec 009 · Credencial de renovación en cookie protegida

**Estado:** Propuesta · parcialmente iniciada (el servidor ya acepta cookies entre sitios) · **Supuesto:** SUP-07 · **Pareja en el frontend:** spec 011

## 1. Contexto y objetivo

Hoy la credencial de renovación (la que mantiene la sesión abierta hasta 7 días) viaja en el cuerpo de las respuestas y la interfaz la guarda en el almacenamiento de la pestaña. Si alguna vez un script malicioso se ejecutara en la página, podría **leerla y llevársela**, y quien la tenga mantendría sesión durante días.

**Objetivo:** que la credencial de renovación viva en un lugar que ningún script de la página pueda leer, para que robar una sesión sea mucho más difícil.

## 2. Usuarios

Todas las personas con cuenta (administración, recepción, técnicos, clientes). El cambio debe pasarles inadvertido.

## 3. Historias de usuario

- **HU-1** Como persona con sesión, quiero que mi sesión no pueda ser robada por un script ajeno, para que mi cuenta esté segura.
- **HU-2** Como persona con sesión, quiero seguir recargando la página sin tener que volver a iniciar sesión.
- **HU-3** Como dueño, quiero poder cortar sesiones sospechosas, igual que hoy.

## 4. Requisitos funcionales

**RF-1 · Entrega protegida**
- RF-1.1 Cuando una persona inicia sesión o renueva su sesión, el sistema deberá entregar la credencial de renovación en una cookie que los scripts de la página no puedan leer.
- RF-1.2 El sistema deberá marcar la cookie para que solo viaje por conexión segura y solo hacia el servidor del sistema.
- RF-1.3 El sistema deberá limitar la vida de la cookie a la de la credencial (7 días).

**RF-2 · Renovación sin intervención**
- RF-2.1 Cuando la interfaz pide renovar la sesión, el sistema deberá leer la credencial de la cookie, sin exigirla en el cuerpo.
- RF-2.2 Cuando la renovación es correcta, el sistema deberá rotar la credencial y reemplazar la cookie (misma regla de rotación de la spec 001).
- RF-2.3 Si no hay cookie o es inválida, entonces el sistema deberá responder "no autenticado" y dejar la sesión cerrada.

**RF-3 · Cierre de sesión**
- RF-3.1 Cuando una persona cierra sesión, el sistema deberá invalidar la credencial y borrar la cookie en el navegador.

**RF-4 · Protección contra uso indebido desde otros sitios**
- RF-4.1 Si una petición de renovación o de cierre de sesión llega desde un origen no autorizado, entonces el sistema deberá rechazarla.
- RF-4.2 El sistema deberá exigir en las operaciones que usan la cookie una señal que un sitio ajeno no pueda fabricar.

**RF-5 · Orígenes permitidos**
- RF-5.1 El sistema deberá aceptar peticiones con credenciales únicamente desde los orígenes configurados del frontend. *(Ya implementado.)*

**RF-6 · Transición**
- RF-6.1 Mientras dure la migración, el sistema deberá seguir aceptando la credencial en el cuerpo para las interfaces que aún no usan la cookie.

## 5. Requisitos no funcionales

- **RNF-1 Seguridad:** ningún script de la página puede leer la credencial de renovación.
- **RNF-2 Compatibilidad:** debe funcionar cuando el frontend y el servidor están en dominios distintos o, preferiblemente, bajo el mismo dominio.
- **RNF-3 Sin pérdida de funciones:** rotación, detección de reutilización y cierre de sesión se comportan como en la spec 001.

## 6. Casos límite

- El navegador bloquea cookies de terceros (frontend y servidor en dominios distintos): la sesión no se restaura al recargar; hay que decidir cómo evitarlo (ver duda 1).
- Dos pestañas renuevan a la vez: la segunda se trata como reutilización (spec 001, RF-2.2).
- El usuario borra las cookies del sitio: la próxima acción lo lleva al inicio de sesión.
- Una interfaz antigua sigue enviando la credencial en el cuerpo (RF-6.1).

## 7. Fuera de alcance

Cambiar la duración de las credenciales, "recordarme en este dispositivo", cerrar sesión en todos los dispositivos.

## 8. Criterios de finalización

- [ ] Iniciar sesión, recargar y seguir autenticado funciona en producción sin guardar la credencial en el almacenamiento del navegador.
- [ ] Un test comprueba que la cookie lleva las marcas de seguridad y que se borra al cerrar sesión.
- [ ] Una petición de renovación desde un origen no autorizado se rechaza (test).
- [x] El servidor acepta peticiones con credenciales desde los orígenes configurados (RF-5.1).

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** (1) Frontend y servidor están en dominios distintos (Vercel y Render): las cookies de terceros se bloquean cada vez más. ¿Se acepta servir la API bajo el dominio del frontend (proxy)?
- **[NECESITA ACLARACIÓN]** (2) ¿Durante cuánto tiempo se mantiene la compatibilidad con el cuerpo (RF-6.1)?
