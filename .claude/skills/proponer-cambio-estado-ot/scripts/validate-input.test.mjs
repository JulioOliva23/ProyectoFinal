// node --test .claude/skills/proponer-cambio-estado-ot/scripts/validate-input.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { validate } from './validate-input.mjs';

const SCRIPT = fileURLToPath(new URL('./validate-input.mjs', import.meta.url));

describe('validate-input', () => {
  it('normalizes the order number and accepts Spanish status labels', () => {
    assert.deepEqual(validate({ orden: 'ot12', estadoDestino: 'En Reparación', motivo: '  Presupuesto   aprobado hoy ' }), {
      ok: true,
      value: { orden: 'OT-000012', estadoDestino: 'IN_REPAIR', motivo: 'Presupuesto aprobado hoy' },
    });
  });

  it('reports every problem at once', () => {
    const result = validate({ orden: 'abc', estadoDestino: 'volando', motivo: 'corto', extra: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.errores.length, 4);
  });

  it('rejects a reason that carries an unlock code (RN-03)', () => {
    const result = validate({ orden: '5', estadoDestino: 'IN_REPAIR', motivo: 'El PIN: 4821 funciona, ya probé' });
    assert.match(result.errores.join(), /RN-03/);
  });

  it('uses exit codes 0 / 1 / 2', () => {
    const run = (arg) => spawnSync('node', arg === undefined ? [SCRIPT] : [SCRIPT, arg]).status;
    assert.equal(run('{"orden":"123","estadoDestino":"APPROVED","motivo":"Cliente aprobó por WhatsApp"}'), 0);
    assert.equal(run('{"orden":"x"}'), 1);
    assert.equal(run('{no json'), 2);
    assert.equal(run(undefined), 2);
  });
});
