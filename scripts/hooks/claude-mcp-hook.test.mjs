// node --test scripts/hooks/claude-mcp-hook.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MAX_PROPOSALS_PER_WINDOW, auditLogPath, maskSecrets, postToolUse, preToolUse, stop } from './claude-mcp-hook.mjs';

const HOOK = fileURLToPath(new URL('./claude-mcp-hook.mjs', import.meta.url));
const propose = (args, extra = {}) => ({
  session_id: 's1',
  tool_name: 'mcp__taller__proponer_transicion',
  tool_input: { orden: ' OT-000123 ', estadoDestino: 'in repair', justificacion: 'Presupuesto aprobado y stock disponible', ...args },
  ...extra,
});

describe('PreToolUse policy', () => {
  it('allows reads and normalizes their parameters', () => {
    const verdict = preToolUse({ tool_name: 'mcp__taller__simular_transicion', tool_input: { orden: ' 123 ', estadoDestino: 'quality control' } });
    assert.equal(verdict.decision, 'allow');
    assert.deepEqual(verdict.updatedInput, { orden: '123', estadoDestino: 'QUALITY_CONTROL' });
  });

  it('denies tools outside the policy', () => {
    assert.equal(preToolUse({ tool_name: 'mcp__taller__borrar_todo', tool_input: {} }).decision, 'deny');
  });

  it('keeps the read-only subagent from proposing', () => {
    const verdict = preToolUse(propose({}, { agent_type: 'agent-ot-auditor' }));
    assert.equal(verdict.decision, 'deny');
    assert.match(verdict.reason, /solo lectura/);
  });

  it('sanitizes a proposal before it reaches the MCP server (AG-03)', () => {
    const verdict = preToolUse(propose({ justificacion: '<b>Presupuesto</b>‮ aprobado\n\n y stock OK' }));
    assert.equal(verdict.decision, 'allow');
    assert.deepEqual(verdict.updatedInput, { orden: 'OT-000123', estadoDestino: 'IN_REPAIR', justificacion: 'Presupuesto aprobado y stock OK' });
  });

  it('blocks a reason that carries an unlock code (RN-03)', () => {
    const verdict = preToolUse(propose({ justificacion: 'Probado con el código de desbloqueo: 482913, todo bien' }));
    assert.equal(verdict.decision, 'deny');
  });

  it('rejects an unknown target status', () => {
    assert.equal(preToolUse(propose({ estadoDestino: 'VOLANDO' })).decision, 'deny');
  });

  it('asks the person in Claude Code before proposing an irreversible status', () => {
    const verdict = preToolUse(propose({ estadoDestino: 'cancelled' }));
    assert.equal(verdict.decision, 'ask');
    assert.equal(verdict.updatedInput.estadoDestino, 'CANCELLED');
  });

  it('rate-limits proposals per session', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    const audit = Array.from({ length: MAX_PROPOSALS_PER_WINDOW }, () => ({
      at: '2026-10-30T11:55:00Z', phase: 'pre', tool: 'proponer_transicion', decision: 'allow', session: 's1',
    }));
    assert.equal(preToolUse(propose({}), { now, audit }).decision, 'deny');
    assert.equal(preToolUse(propose({}, { session_id: 's2' }), { now, audit }).decision, 'allow');
  });
});

describe('PostToolUse', () => {
  const proposal = { id: 'p-1', workOrderNumber: 123, from: 'APPROVED', to: 'IN_REPAIR', status: 'PENDING' };

  it('steers the agent after filing a proposal and records it', () => {
    const result = postToolUse({ tool_name: 'mcp__taller__proponer_transicion', tool_response: [{ type: 'text', text: JSON.stringify(proposal) }] });
    assert.equal(result.proposalStatus, 'PENDING');
    assert.match(result.additionalContext, /PENDIENTE/);
    assert.equal(result.updatedOutput, undefined);
  });

  it('masks a token that slipped into a response', () => {
    const response = { content: [{ type: 'text', text: 'Authorization: Bearer abcdefghijklmnop.qrs' }] };
    const result = postToolUse({ tool_name: 'mcp__taller__ver_orden', tool_response: response });
    assert.equal(result.updatedOutput.content[0].text, 'Authorization: [REDACTADO]');
  });

  it('masks sensitive keys', () => {
    assert.deepEqual(maskSecrets({ unlockCode: '1234', ok: 1 }), { unlockCode: '[REDACTADO]', ok: 1 });
  });
});

describe('Stop intent check', () => {
  const audit = [{ session: 's1', phase: 'post', proposalId: 'p-1', proposalStatus: 'PENDING' }];

  it('blocks a reply that claims the order changed while the proposal is pending', () => {
    const reason = stop({ session_id: 's1', last_assistant_message: 'Listo, cambié el estado de la OT-000123 a En Reparación.' }, audit);
    assert.match(reason, /PENDIENTES/);
  });

  it('lets an accurate reply through', () => {
    assert.equal(stop({ session_id: 's1', last_assistant_message: 'Dejé la propuesta pendiente de aprobación en /aprobaciones.' }, audit), undefined);
  });

  it('lets the claim through once the proposal was executed', () => {
    const executed = [...audit, { session: 's1', phase: 'post', proposalId: 'p-1', proposalStatus: 'EXECUTED' }];
    assert.equal(stop({ session_id: 's1', last_assistant_message: 'Cambié el estado de la OT.' }, executed), undefined);
  });

  it('never loops when Claude is already continuing because of this hook', () => {
    assert.equal(stop({ session_id: 's1', stop_hook_active: true, last_assistant_message: 'Cambié el estado de la OT.' }, audit), undefined);
  });
});

describe('hook process (stdin → stdout, audit log)', () => {
  it('answers with the Claude Code JSON contract and appends to the audit log', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'mcp-hook-'));
    const run = (mode, payload) => execFileSync('node', [HOOK, mode], { input: JSON.stringify({ cwd, ...payload }) }).toString();

    const pre = JSON.parse(run('pre', propose({})));
    assert.equal(pre.hookSpecificOutput.permissionDecision, 'allow');
    assert.equal(pre.hookSpecificOutput.updatedInput.estadoDestino, 'IN_REPAIR');

    run('post', { session_id: 's1', tool_name: 'mcp__taller__proponer_transicion', tool_response: [{ type: 'text', text: '{"id":"p-9","status":"PENDING"}' }] });
    const transcript = join(cwd, 't.jsonl');
    writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Ya quedó en reparación la OT 123.' }] } })}\n`);
    const blocked = JSON.parse(run('stop', { session_id: 's1', transcript_path: transcript }));
    assert.equal(blocked.decision, 'block');

    const log = readFileSync(auditLogPath(cwd), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(log.map((entry) => entry.phase), ['pre', 'post', 'stop']);
  });

  it('fails open with exit 0 on a malformed payload', () => {
    assert.doesNotThrow(() => execFileSync('node', [HOOK, 'pre'], { input: 'no es json', cwd: mkdtempSync(join(tmpdir(), 'mcp-hook-')) }));
  });
});
