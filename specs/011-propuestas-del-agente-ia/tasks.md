# Tareas 011 · Propuestas del agente IA con aprobación humana

Leyenda: `[x]` hecha · `[~]` parcial · `[ ]` pendiente.

- [x] **T1 · Política de dominio (estados, TTL, sanitización, decisión)** — RF-2, RF-3, RF-5
  Hecho cuando: pasan los tests de `agent-action-policy.spec` etiquetados `[011/RF-2.x]`, `[011/RF-3.x]` y `[011/RF-5.1]`.
- [x] **T2 · Roles por transición y tabla para el agente** — RF-1.3, RF-7
  Hecho cuando: pasan "lists the roles allowed for a transition…" y "returns a copy of the table…" `[011/RF-7.1]`.
- [x] **T3 · Simular y proponer** — RF-1
  Hecho cuando: pasan "previews a transition without changing anything", "files a proposal as pending…" y "refuses to propose an illegal transition".
- [x] **T4 · Aprobar ejecutando como la persona** — RF-4.1
  Hecho cuando: pasa "runs the transition as the approver and records the agent origin…" `[011/RF-4.1]`.
- [x] **T5 · Fallo de la transición deja la propuesta pendiente** — RF-4.2
  Hecho cuando: pasa "keeps the proposal pending with the error when the Stock Guard blocks it" `[011/RF-4.2]`.
- [x] **T6 · Candado contra doble ejecución** — RF-3.4
  Hecho cuando: pasa "cannot run the same proposal twice at the same time" `[011/RF-3.4]`.
- [x] **T7 · Stream SSE filtrado por visibilidad** — RF-6.1
  Hecho cuando: pasa "streams created and updated events only to users who can see the order" `[011/RF-6.1]`.
- [x] **T8 · Servidor MCP `taller` (7 tools, 4 resources)** — RNF-1, RNF-2
  Hecho cuando: `npm test --prefix mcp-server` pasa en el job `mcp-server` de la CI.
  *Evidencia: 9 tests, incluido "redacts secrets but keeps booleans".*
- [x] **T9 · Hooks de Claude Code, skill y subagente** — RNF-4
  Hecho cuando: pasan `claude-mcp-hook.test.mjs` (17) y `validate-input.test.mjs` (4) en el job `claude-hooks`.
- [x] **T10 · Pantalla de aprobaciones en vivo (frontPF)** — RF-3, RF-6
  Hecho cuando: pasan los tests de `features/agent-actions` en frontPF y la prueba manual de punta a punta del 2026-10-30.
- [ ] **T11 · Persistir propuestas** — SUP-11
  Hecho cuando: el cliente decide si hacen falta métricas del agente y la regla queda escrita como RF.
