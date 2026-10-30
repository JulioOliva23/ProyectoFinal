#!/usr/bin/env node
// Claude Code lifecycle hooks for the "taller" MCP server (.claude/settings.json).
//
//   pre  (PreToolUse, mcp__taller__.*)  → audit + permission policy + parameter sanitization
//   post (PostToolUse, mcp__taller__.*) → audit result + redact secrets + steer the next step
//   stop (Stop)                         → intent check: never claim a work order changed
//                                         while the agent's proposal is still pending (AG-01)
//
// Reads the hook payload from stdin and answers with the JSON contract of
// Claude Code hooks on stdout. Any internal failure exits 0 (fail open for
// read tools); the backend still enforces RBAC and the four-eyes rule.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SERVER_PREFIX = 'mcp__taller__';
export const READ_ONLY_TOOLS = new Set([
  'buscar_ordenes',
  'ver_orden',
  'ver_auditoria_orden',
  'consultar_stock_bajo',
  'simular_transicion',
  'consultar_propuesta',
]);
export const WRITE_TOOLS = new Set(['proponer_transicion']);
// Subagents that may only read (their own tools list is the first fence; this is the second).
export const READ_ONLY_AGENTS = new Set(['agent-ot-auditor']);
// Irreversible from the customer's point of view: ask the person in Claude Code too.
export const CONFIRM_TARGETS = new Set(['CANCELLED', 'DELIVERED']);
export const MAX_PROPOSALS_PER_WINDOW = 5;
export const PROPOSAL_WINDOW_MS = 10 * 60_000;
export const STATUSES = new Set([
  'RECEIVED', 'IN_DIAGNOSIS', 'BUDGETED', 'APPROVED', 'IN_REPAIR',
  'QUALITY_CONTROL', 'READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
]);

const SENSITIVE_KEY = /unlock|password|token|secret|cipher|hash|unitcost/i;
// RN-03: an unlock code or credential must never travel inside a free-text reason.
const SECRET_IN_TEXT = /(c[oó]digo\s+de\s+desbloqueo|patr[oó]n|pin|contrase[nñ]a|password|clave)\s*[:=]?\s*[\w-]{3,}/i;
const SECRET_VALUE = /\b(Bearer\s+[\w.-]{10,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}|[a-f0-9]{64})\b/g;

export function auditLogPath(cwd) {
  return join(cwd, '.claude', 'logs', 'mcp-audit.jsonl');
}

// ---------------------------------------------------------------- helpers

export function sanitizeText(raw) {
  return [...String(raw).replace(/<[^>]*>/g, ' ')]
    .map((char) => (isInvisible(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInvisible(char) {
  const code = char.codePointAt(0) ?? 0;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
}

export function normalizeStatus(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function maskSecrets(value) {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '[REDACTADO]');
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      // Flags such as hasUnlockCode say whether a secret exists, not what it is.
      SENSITIVE_KEY.test(key) && typeof inner !== 'boolean' && inner !== null ? '[REDACTADO]' : maskSecrets(inner),
    ]),
  );
}

function readAudit(cwd) {
  const path = auditLogPath(cwd);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function writeAudit(cwd, entry) {
  const path = auditLogPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

function toolShortName(toolName) {
  return String(toolName ?? '').startsWith(SERVER_PREFIX) ? toolName.slice(SERVER_PREFIX.length) : undefined;
}

// Text of an MCP tool response, whatever shape Claude Code hands it in.
export function responseText(response) {
  if (typeof response === 'string') return response;
  const blocks = Array.isArray(response) ? response : Array.isArray(response?.content) ? response.content : [];
  return blocks.map((block) => (typeof block?.text === 'string' ? block.text : '')).join('\n');
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- PreToolUse

export function preToolUse(input, { now = Date.now(), audit = [] } = {}) {
  const tool = toolShortName(input.tool_name);
  const args = input.tool_input ?? {};
  const agent = input.agent_type ?? 'principal';
  const deny = (reason) => ({ decision: 'deny', reason });

  if (!tool || (!READ_ONLY_TOOLS.has(tool) && !WRITE_TOOLS.has(tool))) {
    return deny(`Herramienta MCP fuera de la política (${input.tool_name}). Agrégala a claude-mcp-hook.mjs si es legítima.`);
  }
  if (WRITE_TOOLS.has(tool) && READ_ONLY_AGENTS.has(agent)) {
    return deny(`El subagente ${agent} es de solo lectura: devuelve tu veredicto al agente principal en lugar de proponer.`);
  }
  if (tool === 'simular_transicion' || tool === 'proponer_transicion') {
    const target = normalizeStatus(args.estadoDestino);
    if (!STATUSES.has(target)) return deny(`Estado destino desconocido: "${args.estadoDestino}". Usa uno de ${[...STATUSES].join(', ')}.`);
  }
  if (tool !== 'proponer_transicion') {
    const updatedInput = { ...args };
    if ('estadoDestino' in args) updatedInput.estadoDestino = normalizeStatus(args.estadoDestino);
    if (typeof args.orden === 'string') updatedInput.orden = args.orden.trim();
    return { decision: 'allow', reason: 'Lectura permitida por la política MCP', updatedInput };
  }

  const justificacion = sanitizeText(args.justificacion ?? '');
  if (SECRET_IN_TEXT.test(justificacion)) {
    return deny('La justificación parece incluir un código de desbloqueo o una credencial (RN-03). Reescríbela sin datos secretos.');
  }
  if (justificacion.length < 10) return deny('La justificación queda con menos de 10 caracteres tras sanitizarla. Explica el motivo.');

  const recent = audit.filter(
    (entry) => entry.phase === 'pre' && entry.tool === 'proponer_transicion' && entry.decision !== 'deny' &&
      entry.session === input.session_id && now - Date.parse(entry.at) < PROPOSAL_WINDOW_MS,
  );
  if (recent.length >= MAX_PROPOSALS_PER_WINDOW) {
    return deny(`Límite de ${MAX_PROPOSALS_PER_WINDOW} propuestas cada 10 minutos alcanzado. Espera las decisiones pendientes.`);
  }

  const target = normalizeStatus(args.estadoDestino);
  const updatedInput = { orden: String(args.orden ?? '').trim(), estadoDestino: target, justificacion: justificacion.slice(0, 400) };
  if (CONFIRM_TARGETS.has(target)) {
    return {
      decision: 'ask',
      reason: `Propuesta irreversible para el cliente (${target}) sobre ${updatedInput.orden}. ¿Enviarla a aprobación?`,
      updatedInput,
    };
  }
  return { decision: 'allow', reason: 'Propuesta sanitizada; queda pendiente de aprobación humana (AG-01)', updatedInput };
}

// ---------------------------------------------------------------- PostToolUse

export function postToolUse(input) {
  const tool = toolShortName(input.tool_name);
  const text = responseText(input.tool_response);
  const failed = /^Error \d{3}/.test(text) || input.tool_response?.isError === true;
  const payload = failed ? undefined : parseJson(text);
  const result = { failed, proposalId: undefined, proposalStatus: undefined, additionalContext: undefined, updatedOutput: undefined };

  if (tool === 'proponer_transicion' && !failed && payload?.id) {
    result.proposalId = payload.id;
    result.proposalStatus = payload.status;
    result.additionalContext =
      `La propuesta ${payload.id} (OT ${payload.workOrderNumber}: ${payload.from} → ${payload.to}) está PENDIENTE. ` +
      'Di al usuario que debe aprobarla otra persona en /aprobaciones de la app web. No afirmes que la OT cambió de estado.';
  }
  if (tool === 'consultar_propuesta' && !failed && payload?.id) {
    result.proposalId = payload.id;
    result.proposalStatus = payload.status;
  }

  const masked = maskSecrets(input.tool_response);
  if (JSON.stringify(masked) !== JSON.stringify(input.tool_response)) result.updatedOutput = masked;
  return result;
}

// ---------------------------------------------------------------- Stop

// \b is ASCII-only in JS; accented verbs ("cambié") need Unicode-aware edges.
const CLAIMS_CHANGE = new RegExp(
  String.raw`(?<!\p{L})(cambi[eéoó]|actualic[eé]|actualiz[oó]|mov[ií]|movi[oó]|pas[eéoó]|ejecut[eéoó]|avanc[eé]|avanz[oó])(?!\p{L})[^.]{0,60}(?<!\p{L})(estado|orden|OT)(?!\p{L})` +
    String.raw`|(?<!\p{L})ya\s+(est[aá]|qued[oó])\s+(en|como)\s+(reparaci[oó]n|diagn[oó]stico|control|entregad|cancelad|aprobad|listo|IN_|QUALITY|READY|DELIVERED|CANCELLED|APPROVED)`,
  'iu',
);
const MENTIONS_PENDING = /pendiente|aprobaci[oó]n|aprobar|propuesta/i;

export function pendingProposals(audit, sessionId) {
  const latest = new Map();
  for (const entry of audit) {
    if (entry.session !== sessionId || entry.phase !== 'post' || !entry.proposalId) continue;
    latest.set(entry.proposalId, entry.proposalStatus);
  }
  return [...latest].filter(([, status]) => status === 'PENDING').map(([id]) => id);
}

export function lastAssistantText(input) {
  if (typeof input.last_assistant_message === 'string') return input.last_assistant_message;
  if (!input.transcript_path || !existsSync(input.transcript_path)) return '';
  const lines = readFileSync(input.transcript_path, 'utf8').trim().split('\n').reverse();
  for (const line of lines) {
    const entry = parseJson(line);
    const message = entry?.message;
    if (entry?.type !== 'assistant' || !message) continue;
    const content = Array.isArray(message.content) ? message.content : [];
    const text = content.filter((block) => block?.type === 'text').map((block) => block.text).join('\n');
    if (text) return text;
  }
  return '';
}

export function stop(input, audit) {
  if (input.stop_hook_active) return undefined;
  const pending = pendingProposals(audit, input.session_id);
  if (pending.length === 0) return undefined;
  const text = lastAssistantText(input);
  if (!CLAIMS_CHANGE.test(text) || MENTIONS_PENDING.test(text)) return undefined;
  return (
    `Tu respuesta afirma que una OT cambió de estado, pero las propuestas ${pending.join(', ')} siguen PENDIENTES ` +
    'de aprobación humana (AG-01). Corrige el mensaje: di que la propuesta espera aprobación en /aprobaciones, ' +
    'o confirma con consultar_propuesta si ya se ejecutó.'
  );
}

// ---------------------------------------------------------------- main

function respond(output) {
  process.stdout.write(JSON.stringify(output));
}

function main() {
  const mode = process.argv[2];
  const raw = readFileSync(0, 'utf8');
  const input = parseJson(raw) ?? {};
  const cwd = input.cwd ?? process.cwd();
  const audit = readAudit(cwd);
  const base = { session: input.session_id, agent: input.agent_type ?? 'principal', tool: toolShortName(input.tool_name) };

  if (mode === 'pre') {
    const verdict = preToolUse(input, { audit });
    writeAudit(cwd, { ...base, phase: 'pre', decision: verdict.decision, reason: verdict.reason, input: maskSecrets(verdict.updatedInput ?? input.tool_input) });
    respond({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: verdict.decision,
        permissionDecisionReason: verdict.reason,
        ...(verdict.updatedInput ? { updatedInput: verdict.updatedInput } : {}),
      },
    });
    return;
  }

  if (mode === 'post') {
    const result = postToolUse(input);
    writeAudit(cwd, { ...base, phase: 'post', failed: result.failed, proposalId: result.proposalId, proposalStatus: result.proposalStatus });
    const hookSpecificOutput = { hookEventName: 'PostToolUse' };
    if (result.additionalContext) hookSpecificOutput.additionalContext = result.additionalContext;
    if (result.updatedOutput) hookSpecificOutput.updatedMCPToolOutput = result.updatedOutput;
    respond({ hookSpecificOutput });
    return;
  }

  if (mode === 'stop') {
    const reason = stop(input, audit);
    if (reason) {
      writeAudit(cwd, { ...base, phase: 'stop', decision: 'block' });
      respond({ decision: 'block', reason });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`claude-mcp-hook: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exit(0);
}
