---
name: proponer-cambio-estado-ot
description: Propone el cambio de estado de una orden de trabajo (OT) del servicio técnico con validación previa y aprobación humana. Úsala cuando el usuario pida mover, avanzar, cancelar o entregar una OT ("pasa la OT-123 a reparación", "cancela la 45", "¿puedo entregar la 88?"). Valida la entrada, delega la verificación en @agent-ot-auditor y registra una propuesta PENDIENTE en el servidor MCP taller; nunca ejecuta el cambio.
allowed-tools: Bash(node .claude/skills/proponer-cambio-estado-ot/scripts/validate-input.mjs *), Task, mcp__taller__proponer_transicion, mcp__taller__consultar_propuesta
---

# Proponer cambio de estado de una OT

Flujo **agente → validación → subagente → propuesta → humano**. El cambio real solo ocurre cuando otra persona lo aprueba en la app web (`/aprobaciones`). Reglas: AG-01…AG-04 y RN-04/05/06/09/12 de `AI_CONTEXT.md`.

## 1. Contrato de entrada

Arma este JSON a partir del pedido del usuario (esquema completo en [`schema.json`](schema.json)):

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `orden` | string | UUID o número: `OT-000123`, `ot123`, `123` |
| `estadoDestino` | enum | `RECEIVED · IN_DIAGNOSIS · BUDGETED · APPROVED · IN_REPAIR · QUALITY_CONTROL · READY_FOR_DELIVERY · DELIVERED · CANCELLED`. Acepta la etiqueta en español ("En Reparación") |
| `motivo` | string | 10–400 caracteres, **sin** códigos de desbloqueo, PIN, contraseñas ni tokens (RN-03) |

Si el usuario no dio el motivo, **pregúntalo**; no lo inventes.

## 2. Validar (determinista)

```bash
node .claude/skills/proponer-cambio-estado-ot/scripts/validate-input.mjs '<json>'
```

| Salida | Significado | Qué haces |
| --- | --- | --- |
| exit 0 + JSON normalizado en stdout | Entrada válida | Sigue con el paso 3 usando **ese** JSON |
| exit 1 + `{"errores":[…]}` | Entrada inválida | Muestra los errores al usuario y pide la corrección. No sigas |
| exit 2 | Error de uso (JSON mal formado) | Corrige tu propio JSON y reintenta una vez |

## 3. Delegar la verificación en `@agent-ot-auditor`

Lanza el subagente con la Task tool (`subagent_type: "agent-ot-auditor"`) pasándole el JSON normalizado. Es de solo lectura y devuelve:

```json
{ "veredicto": "GO | NO-GO", "transicion": "…", "aprobadoresPosibles": […], "bloqueos": […], "riesgos": […], "justificacionSugerida": "…" }
```

- `NO-GO` → explica los `bloqueos` al usuario y ofrece las alternativas. **Fin.**
- `GO` con `riesgos` → muéstralos y pide confirmación explícita antes de seguir.
- `GO` sin riesgos → sigue.

## 4. Proponer

Llama `mcp__taller__proponer_transicion` con `orden`, `estadoDestino` y `justificacion` (usa `justificacionSugerida` del subagente, ajustada con el motivo del usuario).

Lo que pasa alrededor de esa llamada (no lo repliques, ya existe):

- **Hook `PreToolUse`** (`scripts/hooks/claude-mcp-hook.mjs pre`): audita, sanitiza la justificación, bloquea secretos y aplica el límite de 5 propuestas cada 10 min. Para `CANCELLED`/`DELIVERED` te pedirá confirmación en Claude Code.
- **Hook `PostToolUse`**: registra la propuesta y te recuerda que está pendiente.
- **Backend**: la guarda como `PENDING` 15 minutos y la emite por SSE a la pantalla de aprobaciones.

## 5. Informar

Responde con: número de OT, transición, id de la propuesta, quién puede aprobarla (`approverRoles`) y hasta cuándo (`expiresAt`). Ejemplo:

> Dejé la propuesta `9a1f…` para pasar la **OT-000123** de *Aprobado* a *En Reparación*. Debe aprobarla un técnico asignado o un administrador en **/aprobaciones** antes de las 12:15. Hasta entonces la OT no cambia.

**Nunca** digas que la OT cambió de estado: el hook `Stop` bloquea esa respuesta mientras la propuesta siga pendiente. Si el usuario pregunta después, usa `mcp__taller__consultar_propuesta`.

## Errores

| Error | Causa | Respuesta |
| --- | --- | --- |
| `Error 409` | Transición ilegal o la OT cambió | Vuelve al paso 3 con el estado nuevo |
| `Error 403` | El agente no ve esa OT | Dilo; no reintentes con otra cuenta |
| `Error 404` | La OT no existe | Pide el número correcto |
| `Error 503` | API caída o dormida (Render tarda ~1 min) | Espera y reintenta **una** vez |
| Hook `deny` | Política violada (secreto, límite, subagente) | Lee el motivo y corrige; no lo evadas |
