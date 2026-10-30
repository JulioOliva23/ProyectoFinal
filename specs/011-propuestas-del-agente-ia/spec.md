# Spec 011 · Propuestas del agente IA con aprobación humana

**Estado:** Implementada (2026-10-30) · **Reglas:** AG-01, AG-02, AG-03, AG-04, RN-04, RN-06, RN-12 · **Supuestos:** SUP-11 · **Depende de:** spec 004 (ciclo de vida de la orden), spec 007 (Stock Guard)

## 1. Contexto y objetivo

El personal del taller ya usa un asistente de IA (Claude Code con el servidor MCP `taller`) para consultar órdenes. Pedirle "pasa la OT-123 a reparación" es cómodo, pero un modelo puede equivocarse de orden, inventar una justificación o recibir texto malicioso dentro de las notas de una OT. Un cambio de estado mueve stock y le llega al cliente: no puede quedar en manos del modelo.

**Objetivo:** que el agente pueda **proponer** cambios de estado, validados y auditados, y que solo una **persona distinta** los ejecute desde la app web, en vivo y con su propia identidad.

## 2. Usuarios

| Rol | Interés |
| --- | --- |
| Agente IA (cuenta `agente-ia`, rol Recepción) | Consultar, simular y proponer; nunca decidir |
| Administrador | Aprobar o rechazar cualquier propuesta que la máquina de estados le permita |
| Recepción | Aprobar o rechazar según la máquina de estados |
| Técnico | Decidir solo sobre las órdenes que tiene asignadas |

## 3. Historias de usuario

- **HU-1** Como recepcionista, quiero pedirle al asistente que mueva una OT, para no navegar pantallas cuando atiendo a un cliente.
- **HU-2** Como administrador, quiero que nada cambie sin que una persona lo apruebe, para que un error del modelo no mueva stock ni avise al cliente.
- **HU-3** Como técnico, quiero ver al instante las propuestas sobre mis órdenes, para decidir sin recargar la página.
- **HU-4** Como dueño, quiero saber después qué cambios vinieron del agente y quién los aprobó, para auditar reclamos.

## 4. Requisitos funcionales

**RF-1 · Simulación y propuesta** (HU-1)
- RF-1.1 Cuando el agente simula una transición, el sistema deberá informar si es legal, qué roles pueden aprobarla y sus precondiciones, sin cambiar nada.
- RF-1.2 Cuando el agente propone una transición legal, el sistema deberá registrar una propuesta PENDIENTE sin cambiar la orden (AG-01).
- RF-1.3 Si la transición propuesta no es legal según la máquina de estados, entonces el sistema deberá rechazar la propuesta (RN-04).

**RF-2 · Texto del modelo como entrada no confiable** (HU-2)
- RF-2.1 El sistema deberá quitar de la justificación el marcado, los caracteres de control y los de dirección bidireccional, y colapsar los espacios (AG-03).
- RF-2.2 El sistema deberá limitar la justificación a 400 caracteres.
- RF-2.3 Si la justificación queda con menos de 10 caracteres después de sanitizarla, entonces el sistema deberá rechazar la propuesta.

**RF-3 · Quién decide** (HU-2, HU-3)
- RF-3.1 Si la cuenta que propuso intenta aprobar o rechazar su propia propuesta, entonces el sistema deberá negarlo (AG-04, cuatro ojos).
- RF-3.2 Si un técnico intenta decidir sobre una orden que no tiene asignada, entonces el sistema deberá negarlo (RN-06).
- RF-3.3 Cuando alguien aprueba, el sistema deberá exigir que su rol esté entre los aceptados por la máquina de estados para esa transición; cualquier miembro del personal que pueda ver la orden podrá rechazarla.
- RF-3.4 Si la propuesta ya fue decidida o se está ejecutando, entonces el sistema deberá rechazar una segunda decisión (AG-01).

**RF-4 · Ejecución** (HU-2, HU-4)
- RF-4.1 Cuando una persona aprueba, el sistema deberá ejecutar la transición por el servicio único de transiciones (spec 004) con la identidad y el rol de quien aprueba, y dejar en el motivo de auditoría el origen "Agente IA" y el número de propuesta (RN-12).
- RF-4.2 Si la transición falla al aprobar (por ejemplo, el Stock Guard no encuentra repuestos), entonces el sistema deberá dejar la propuesta PENDIENTE con el error y devolverlo a quien aprueba.

**RF-5 · Vencimiento** (HU-2)
- RF-5.1 El sistema deberá considerar vencida una propuesta PENDIENTE con más de 15 minutos, marcarla así al leerla y rechazar su aprobación (AG-02).

**RF-6 · Tiempo real y visibilidad** (HU-3)
- RF-6.1 El sistema deberá emitir por un stream SSE cada propuesta creada o actualizada, solo a quien puede ver la orden: el técnico, las suyas; recepción y administración, todas.

**RF-7 · Reglas expuestas al agente** (HU-1)
- RF-7.1 El sistema deberá publicar la tabla de transiciones con los roles que pueden ejecutar cada una, como copia que no permita alterar la tabla real.

## 5. Requisitos no funcionales

- **RNF-1 Mínimo privilegio:** el servidor MCP solo habla con la API HTTP con el JWT de `agente-ia`; nunca toca la base de datos. RBAC, DTOs y RN-04 siguen aplicando.
- **RNF-2 Sin secretos al modelo:** las respuestas que vuelven al modelo no incluyen códigos de desbloqueo, contraseñas ni tokens (RN-03).
- **RNF-3 Latencia:** la propuesta aparece en la app web en menos de 2 segundos (SSE con latido cada 25 s).
- **RNF-4 Defensa en capas:** los hooks de Claude Code validan y sanitizan antes del servidor, pero la garantía es el backend.

## 6. Casos límite

- Dos personas aprueban la misma propuesta a la vez: solo una ejecuta (RF-3.4).
- El stock se acaba entre la propuesta y la aprobación: la propuesta sigue PENDIENTE con el error 422 (RF-4.2).
- La API se reinicia: las propuestas sin decidir se pierden; lo ejecutado ya está en la auditoría (SUP-11).
- Una justificación con `<script>` o caracteres bidi invisibles: llega limpia (RF-2.1).
- Cancelar o entregar (irreversibles): el hook pide confirmación al usuario antes de proponer y la app exige escribir el número de OT.

## 7. Fuera de alcance

Persistir propuestas en la base de datos (SUP-11), varias instancias de la API, que el agente ejecute cambios sin aprobación, otras acciones del agente distintas del cambio de estado.

## 8. Criterios de finalización

- [x] RF-1 a RF-7 tienen al menos un test etiquetado que pasa.
- [x] Prueba extremo a extremo manual del flujo MCP → app web → aprobación → auditoría (2026-10-30, `mcp-server/README.md`).
- [x] Los hooks de Claude Code y el servidor MCP tienen sus propias pruebas en CI (`Hooks & Subagents`).

## 9. Dudas abiertas

- **[NECESITA ACLARACIÓN]** ¿15 minutos es el vencimiento correcto para el ritmo del mostrador?
- **[NECESITA ACLARACIÓN]** ¿Se deben persistir las propuestas rechazadas o vencidas para métricas del agente? (SUP-11).
