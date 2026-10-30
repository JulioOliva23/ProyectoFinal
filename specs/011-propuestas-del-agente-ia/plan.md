# Plan 011 · Propuestas del agente IA con aprobación humana

Cumple la [constitución](../../docs/constitution.md) (C3.3 capas, C7.1 toda ruta declara roles, C6.2 textos en español). Cubre RF-1 a RF-7 de [spec.md](spec.md). Arquitectura completa y diagrama: [`mcp-server/README.md`](../../mcp-server/README.md).

## 1. Estructura de módulos

| Archivo | Responsabilidad | RF |
| --- | --- | --- |
| `servicio_back/src/domain/agent-actions/agent-action-policy.ts` | Estados, TTL, `sanitizeAgentText`, `checkDecision`, `isVisibleTo` (dominio puro, sin Nest) | RF-2, RF-3, RF-5, RF-6 |
| `servicio_back/src/domain/work-orders/work-order-state-machine.ts` | `rolesAllowedFor` y `transitionTable` (copia) | RF-1.3, RF-3.3, RF-7 |
| `modules/agent-actions/agent-action.store.ts` | Propuestas en memoria (máx. 200) y `Subject` de eventos | RF-1.2, RF-6 (SUP-11) |
| `modules/agent-actions/agent-actions.service.ts` | Simular, proponer, aprobar (con candado en vuelo), rechazar, stream | RF-1 a RF-6 |
| `modules/agent-actions/agent-actions.controller.ts` | Rutas `@Roles(STAFF)`; `stream` antes de `:id`; no expone `technicianId` | RF-1, RF-3, RF-6, RF-7 |
| `mcp-server/` | Servidor MCP `taller`: 7 tools y 4 resources, validación zod, redacción de secretos | RNF-1, RNF-2 |
| `scripts/hooks/claude-mcp-hook.mjs` | Hooks PreToolUse/PostToolUse/Stop: auditoría, política, sanitización, "ask" en irreversibles | RNF-4 |
| `.claude/skills/proponer-cambio-estado-ot/`, `.claude/agents/agent-ot-auditor.md` | Skill con schema y subagente de solo lectura | HU-1 |

## 2. Modelo de datos

```json
{
  "AgentAction": {
    "id": "6f1c…", "workOrderId": "…", "workOrderNumber": 123, "technicianId": "…",
    "from": "APPROVED", "to": "IN_REPAIR",
    "reason": "El cliente aprobó por WhatsApp", "approverRoles": ["ADMIN", "TECHNICIAN"],
    "status": "PENDING", "requestedBy": { "id": "…", "role": "RECEPTIONIST" },
    "createdAt": "2026-10-30T14:00:00.000Z", "expiresAt": "2026-10-30T14:15:00.000Z",
    "decidedBy": null, "decidedAt": null, "decisionNote": null, "lastError": null
  }
}
```

Estados: `PENDING` → `EXECUTED` | `REJECTED` | `EXPIRED`. Sin tabla nueva (SUP-11). La respuesta HTTP omite `technicianId`.

## 3. Algoritmos

```text
propose(dto, agent):                                                  # RF-1.2, RF-1.3, RF-2
  order = requireVisibleOrder(dto.workOrderId, agent)
  roles = rolesAllowedFor(order.status, dto.to)
  if roles = []: throw 409 "RN-04: transición ilegal"
  reason = sanitizeAgentText(dto.reason)          # quita marcado/control/bidi, corta a 400
  if len(reason) < 10: throw 422 "AG-03"
  store.create(PENDING, expiresAt = now + 15 min) ; emit created

approve(id, approver, note):                                          # RF-3, RF-4, RF-5
  action = expireIfStale(store.get(id))
  checkDecision(action, approver, 'approve') → 409 NOT_PENDING / EXPIRED · 403 SELF / NOT_ASSIGNED / ROLE
  if id ∈ inFlight: throw 409 "ya se está ejecutando"
  inFlight.add(id)
  try   transitions.transition(order, to, userId = approver.id, role = approver.role,
                               reason = "[Agente IA · propuesta xxxxxxxx] … · Nota de aprobación: …")
        store.update(EXECUTED) ; emit updated
  catch HttpException e: store.update(lastError = e) ; emit updated ; rethrow     # sigue PENDING
  finally inFlight.delete(id)
```

## 4. Contrato de uso (`/api/v1/agent-actions`)

| Operación | Ruta | Roles | Notas |
| --- | --- | --- | --- |
| Reglas | `GET state-machine` | Staff | RF-7 |
| Simular | `POST preview` `{workOrderId, to}` | Staff | RF-1.1, sin efectos |
| Proponer | `POST /` `{workOrderId, to, reason}` | Staff | 409 ilegal · 422 justificación vacía |
| Listar / detalle | `GET /?status=` · `GET :id` | Staff | filtrado por visibilidad (RN-06) |
| Stream | `GET stream` (SSE `created` · `updated` · `ping`) | Staff | RF-6 |
| Aprobar / rechazar | `POST :id/approve` · `POST :id/reject` `{note?}` | Staff | 403 AG-04 / RN-06 / RN-04 · 409 AG-01 / AG-02 |

## 5. Decisiones técnicas

| Decisión | Justificación | Alternativa descartada |
| --- | --- | --- |
| Proponer en vez de ejecutar | Un error del modelo no mueve stock ni avisa al cliente (AG-01) | Tool `cambiar_estado` directa: el modelo decide solo |
| Ejecutar con la identidad de quien aprueba | La auditoría muestra a la persona responsable; RBAC y RN-04 se aplican a ella | Ejecutar como `agente-ia`: diluye la responsabilidad |
| Propuestas en memoria con TTL | Alcance del proyecto; una sola instancia (SUP-11) | Tabla nueva con migración |
| SSE en vez de WebSocket | Un solo sentido, atraviesa proxies, `@Sse` nativo en Nest | WebSocket: más infraestructura para el mismo efecto |
| Sanitizar en el hook **y** en el backend | El hook ahorra viajes; el backend es la garantía | Confiar solo en el cliente |

## 6. Estrategia de tests

| Nivel | Tests | RF |
| --- | --- | --- |
| Unitario `agent-action-policy.spec.ts` | sanitización y longitud · cuatro ojos · vencida · doble decisión · técnico ajeno · recepción rechaza pero no aprueba · visibilidad · tabla de transiciones | RF-2, RF-3, RF-5, RF-6, RF-7 |
| Unitario `agent-actions.service.spec.ts` | simulación · propuesta pendiente · transición ilegal · justificación vacía · ejecuta como quien aprueba · Stock Guard deja pendiente · sin doble ejecución · stream filtrado · vencimiento al leer | RF-1 a RF-6 |
| `mcp-server/test/server.test.ts` (9) | tools y resources con cliente MCP en memoria, redacción, errores con código | RNF-1, RNF-2 |
| `scripts/hooks/claude-mcp-hook.test.mjs` (17) | política por herramienta y subagente, sanitización, límite de propuestas, Stop | RNF-4 |
| Front `features/agent-actions` | parser SSE, hook de streaming, modal de aprobación | RF-6 (lado cliente) |
