#!/usr/bin/env node
// Validates and normalizes the input of the proponer-cambio-estado-ot skill.
//   exit 0 → normalized JSON on stdout
//   exit 1 → {"errores":[...]} on stdout (invalid input, ask the user)
//   exit 2 → usage error (malformed JSON or missing argument)
import { pathToFileURL } from 'node:url';

export const STATUSES = [
  'RECEIVED', 'IN_DIAGNOSIS', 'BUDGETED', 'APPROVED', 'IN_REPAIR',
  'QUALITY_CONTROL', 'READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
];

// UI labels (AI_CONTEXT.md §5) → enum, so the user's words work as-is.
const LABELS = {
  INGRESADO: 'RECEIVED',
  EN_DIAGNOSTICO: 'IN_DIAGNOSIS',
  PRESUPUESTADO: 'BUDGETED',
  APROBADO: 'APPROVED',
  EN_REPARACION: 'IN_REPAIR',
  CONTROL_DE_CALIDAD: 'QUALITY_CONTROL',
  LISTO_PARA_ENTREGA: 'READY_FOR_DELIVERY',
  ENTREGADO: 'DELIVERED',
  CANCELADO: 'CANCELLED',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^(?:OT-?)?0*(\d{1,9})$/i;
const SECRET = /(c[oó]digo\s+de\s+desbloqueo|patr[oó]n|pin|contrase[nñ]a|password|clave|token)\s*[:=]?\s*[\w-]{3,}/i;

export function normalizeStatus(raw) {
  const key = String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return STATUSES.includes(key) ? key : LABELS[key];
}

export function normalizeOrder(raw) {
  const value = String(raw ?? '').trim();
  if (UUID.test(value)) return value.toLowerCase();
  const match = NUMBER.exec(value);
  return match ? `OT-${match[1].padStart(6, '0')}` : undefined;
}

export function validate(input) {
  const errores = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errores: ['La entrada debe ser un objeto JSON'] };
  }
  const extra = Object.keys(input).filter((key) => !['orden', 'estadoDestino', 'motivo'].includes(key));
  if (extra.length) errores.push(`Campos no permitidos: ${extra.join(', ')}`);

  const orden = normalizeOrder(input.orden);
  if (!orden) errores.push('orden: usa el UUID o el número de la OT (OT-000123 / 123)');

  const estadoDestino = normalizeStatus(input.estadoDestino);
  if (!estadoDestino) errores.push(`estadoDestino: "${input.estadoDestino ?? ''}" no es un estado válido (${STATUSES.join(', ')})`);

  const motivo = typeof input.motivo === 'string' ? input.motivo.replace(/\s+/g, ' ').trim() : '';
  if (motivo.length < 10 || motivo.length > 400) errores.push('motivo: entre 10 y 400 caracteres');
  if (SECRET.test(motivo)) errores.push('motivo: no incluyas códigos de desbloqueo ni credenciales (RN-03)');

  return errores.length ? { ok: false, errores } : { ok: true, value: { orden, estadoDestino, motivo } };
}

function main() {
  const raw = process.argv[2];
  if (!raw) {
    process.stderr.write('Uso: validate-input.mjs \'{"orden":"OT-000123","estadoDestino":"IN_REPAIR","motivo":"..."}\'\n');
    process.exit(2);
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    process.stderr.write(`JSON mal formado: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
  const result = validate(input);
  process.stdout.write(`${JSON.stringify(result.ok ? result.value : { errores: result.errores })}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
