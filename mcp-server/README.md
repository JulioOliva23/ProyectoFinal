# Agente IA con aprobación humana — MCP · Skill · Subagente · Hooks

Caso de uso: **cambios de estado de órdenes de trabajo propuestos por IA y ejecutados solo con aprobación humana**. El agente consulta, valida y *propone*; una persona distinta *decide* desde la app web, en vivo. Combina tres cosas de alto valor para el taller: auditoría en tiempo real (RN-12), validación y sanitización estricta entre cliente y servidor, y human-in-the-loop.

## Flujo

```text
Usuario ──▶ Claude Code (agente principal)
              │ 1. Skill proponer-cambio-estado-ot
              │      └─ validate-input.mjs  (schema.json · exit 0/1/2)
              │ 2. Task ──▶ @agent-ot-auditor  (solo lectura)
              │               └─ mcp__taller__ver_orden / simular_transicion / ver_auditoria_orden / consultar_stock_bajo
              │               ◀─ { veredicto: GO | NO-GO, riesgos, justificacionSugerida }
              │ 3. mcp__taller__proponer_transicion
              │
   ┌──────────┴─────────── Hooks de Claude Code (.claude/settings.json) ───────────────────────┐
   │ PreToolUse  mcp__taller__.*  → auditoría JSONL · política por herramienta y subagente ·    │
   │                                sanitización (updatedInput) · bloqueo de secretos (RN-03) · │
   │                                límite 5 propuestas/10 min · "ask" si CANCELLED/DELIVERED   │
   │ PostToolUse mcp__taller__.*  → auditoría del resultado · enmascara secretos               │
   │                                (updatedMCPToolOutput) · additionalContext "está PENDIENTE" │
   │ Stop                         → bloquea la respuesta si afirma que la OT cambió mientras la │
   │                                propuesta sigue PENDING                                     │
   └──────────┬─────────────────────────────────────────────────────────────────────────────────┘
              ▼
   mcp-server (stdio)  ──HTTP + JWT del usuario agente-ia──▶  servicio_back /api/v1/agent-actions
   tools + resources       (nunca toca la BD: RBAC, DTOs y       ├─ POST /agent-actions         → PENDING (15 min)
   redacción de secretos    RN-04 siguen aplicando)              ├─ GET  /agent-actions/stream  → SSE created/updated/ping
                                                                 └─ POST /:id/approve           → WorkOrderTransitionService
                                                                       (como quien aprueba: Preconditions → Stock Guard → Audit Trail)
              ┌──────────────────────────────────────────────────────────┘
              ▼
   frontPF /aprobaciones
     useAgentActionStream()  → intercepta el stream: valida, deja vetar (onEvent), escribe en la caché de React Query,
                               invalida OTs/stock al ejecutarse, reconecta con backoff y renueva la sesión ante 401
     AgentActionsLive        → toast solo a quien puede decidir (renderizado condicional)
     AgentApprovalModal      → confirmación explícita; escribir el número de OT si el cambio es irreversible
```

## Reglas (AG-xx)

| ID | Regla | Dónde se aplica |
| --- | --- | --- |
| AG-01 | El agente nunca cambia una OT: propone; solo la aprobación ejecuta la transición, con la identidad y el rol de quien aprueba | `AgentActionsService.approve`, tool `proponer_transicion`, hook `Stop` |
| AG-02 | Una propuesta vence a los 15 minutos | `agent-action-policy.ts` |
| AG-03 | El texto escrito por el modelo es entrada no confiable: se quitan marcado, caracteres de control y bidi, y se limita la longitud | hook `PreToolUse`, `sanitizeAgentText` (back) |
| AG-04 | Cuatro ojos: la cuenta que propone no puede decidir; un técnico solo decide sobre sus OTs; aprobar exige un rol aceptado por la máquina de estados | `checkDecision` (back), `canApprove` (front, solo UI) |

## Servidor MCP `taller`

| Tipo | Nombre | Descripción |
| --- | --- | --- |
| tool (lectura) | `buscar_ordenes` | OTs paginadas por texto/estado |
| tool (lectura) | `ver_orden` | Detalle de una OT (UUID o `OT-000123`) |
| tool (lectura) | `ver_auditoria_orden` | Historial inmutable (RN-12) |
| tool (lectura) | `consultar_stock_bajo` | Alertas RN-11 |
| tool (lectura) | `simular_transicion` | Dry run: legalidad, aprobadores, precondiciones |
| tool (escritura) | `proponer_transicion` | Crea la propuesta PENDING |
| tool (lectura) | `consultar_propuesta` | Estado de una propuesta |
| resource | `taller://reglas/maquina-estados` | Tabla de transiciones y roles |
| resource | `taller://inventario/stock-bajo` | Alertas de stock |
| resource | `taller://propuestas/pendientes` | Propuestas esperando decisión |
| resource template | `taller://ordenes/{orden}` | Detalle de una OT |

Los inputs se validan con zod antes de llamar a la API (estado normalizado: `"in repair"` → `IN_REPAIR`). Los errores vuelven como `isError` con el código HTTP y el código de dominio (`Error 422 INSUFFICIENT_STOCK: …`) para que el modelo pueda actuar.

## Puesta en marcha

```bash
npm ci --prefix mcp-server && npm run build --prefix mcp-server
export TALLER_AGENT_PASSWORD=...   # contraseña del usuario agente-ia (seed, SEED_PASSWORD_RECEPTIONIST)
export TALLER_API_URL=http://localhost:3000/api/v1   # opcional
claude   # .mcp.json registra el servidor "taller"; settings.json lo habilita
```

Luego: *"pasa la OT-000123 a reparación porque el cliente aprobó por WhatsApp"*. La propuesta aparece al instante en `/aprobaciones` del front.

## Pruebas

| Qué | Comando |
| --- | --- |
| Servidor MCP (cliente ↔ servidor en memoria, redacción, cliente HTTP) | `npm test --prefix mcp-server` |
| Hooks de Claude (política, sanitización, Stop, proceso stdin/stdout) | `node --test scripts/hooks/claude-mcp-hook.test.mjs` |
| Validación de entrada de la skill | `node --test .claude/skills/proponer-cambio-estado-ot/scripts/validate-input.test.mjs` |
| Backend (política AG-xx, servicio, SSE) | `npm test --prefix servicio_back -- agent-action` |
| Front (parser SSE, hook de streaming, página HITL) | `npm test -- agent-actions` en `frontPF` |

Todo corre en CI (`Hooks & Subagents`: jobs `claude-hooks` y `mcp-server`). El registro local de auditoría de los hooks queda en `.claude/logs/mcp-audit.jsonl` (ignorado por git).

## Limitaciones

- **SUP-11:** las propuestas viven en memoria (una sola instancia de la API). Si la API se reinicia, se pierden las propuestas sin decidir; lo ejecutado ya está en la auditoría.
- El hook `Stop` detecta afirmaciones falsas con una heurística en español. El backend sigue siendo la garantía real.
