import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { HttpTallerApi, TallerApiError, type TallerApi } from '../src/api-client.js';
import { REDACTED, redactSensitive } from '../src/redact.js';
import { parseWorkOrderRef } from '../src/schemas.js';
import { createTallerServer } from '../src/server.js';

const ORDER_ID = '7d1f7c2e-1d5b-4e0a-9c1a-111111111111';
const ACTION_ID = '9a1f7c2e-1d5b-4e0a-9c1a-222222222222';

class FakeApi implements TallerApi {
  calls: Array<{ method: string; path: string; body?: unknown }> = [];
  failWith?: TallerApiError;

  async get<T>(path: string): Promise<T> {
    this.calls.push({ method: 'GET', path });
    if (this.failWith) throw this.failWith;
    if (path.startsWith('/work-orders?search=')) return { data: [{ id: ORDER_ID, number: 123, status: 'APPROVED' }] } as T;
    if (path === `/work-orders/${ORDER_ID}`) return { id: ORDER_ID, number: 123, status: 'APPROVED', unlockCodeCipher: 'abc' } as T;
    return [] as T;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    this.calls.push({ method: 'POST', path, body });
    if (this.failWith) throw this.failWith;
    return { id: ACTION_ID, workOrderNumber: 123, status: 'PENDING', expiresAt: '2026-10-30T12:15:00Z' } as T;
  }
}

async function connect(api: TallerApi): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createTallerServer(api).connect(serverTransport);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [first] = result.content as Array<{ type: string; text: string }>;
  return first?.text ?? '';
}

describe('taller MCP server', () => {
  let api: FakeApi;
  let client: Client;

  beforeEach(async () => {
    api = new FakeApi();
    client = await connect(api);
  });

  it('exposes the read tools, the proposal tool and the resources', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'buscar_ordenes',
      'consultar_propuesta',
      'consultar_stock_bajo',
      'proponer_transicion',
      'simular_transicion',
      'ver_auditoria_orden',
      'ver_orden',
    ]);
    assert.equal(tools.find((tool) => tool.name === 'proponer_transicion')?.annotations?.readOnlyHint, false);
    assert.equal(tools.find((tool) => tool.name === 'ver_orden')?.annotations?.readOnlyHint, true);

    const { resources } = await client.listResources();
    assert.ok(resources.some((resource) => resource.uri === 'taller://reglas/maquina-estados'));
    const { resourceTemplates } = await client.listResourceTemplates();
    assert.equal(resourceTemplates[0]?.uriTemplate, 'taller://ordenes/{orden}');
  });

  it('resolves an order number, normalizes the status and files a proposal (AG-01)', async () => {
    const result = await client.callTool({
      name: 'proponer_transicion',
      arguments: { orden: 'ot-123', estadoDestino: 'in repair', justificacion: '  Presupuesto aprobado y stock disponible  ' },
    });

    assert.equal(result.isError, undefined);
    assert.deepEqual(api.calls.at(-1), {
      method: 'POST',
      path: '/agent-actions',
      body: { workOrderId: ORDER_ID, to: 'IN_REPAIR', reason: 'Presupuesto aprobado y stock disponible' },
    });
    assert.match(text(result), /Pendiente de aprobación humana/);
  });

  it('rejects invalid input before calling the API', async () => {
    const result = await client.callTool({
      name: 'proponer_transicion',
      arguments: { orden: 'no-es-una-orden', estadoDestino: 'VOLANDO', justificacion: 'corta' },
    });

    assert.equal(result.isError, true);
    assert.equal(api.calls.length, 0);
  });

  it('masks sensitive fields before they reach the model (RN-03)', async () => {
    const result = await client.callTool({ name: 'ver_orden', arguments: { orden: ORDER_ID } });

    assert.match(text(result), /"unlockCodeCipher": "\[REDACTADO\]"/);
    assert.doesNotMatch(text(result), /abc/);
  });

  it('turns API errors into actionable tool errors', async () => {
    api.failWith = new TallerApiError(422, 'Stock insuficiente', 'INSUFFICIENT_STOCK');

    const result = await client.callTool({ name: 'simular_transicion', arguments: { orden: ORDER_ID, estadoDestino: 'IN_REPAIR' } });

    assert.equal(result.isError, true);
    assert.equal(text(result), 'Error 422 INSUFFICIENT_STOCK: Stock insuficiente');
  });

  it('reads the state machine resource', async () => {
    const result = await client.readResource({ uri: 'taller://reglas/maquina-estados' });

    assert.equal(result.contents[0]?.mimeType, 'application/json');
    assert.deepEqual(api.calls.at(-1), { method: 'GET', path: '/agent-actions/state-machine' });
  });
});

describe('parseWorkOrderRef', () => {
  it('accepts UUIDs and the usual ways of writing an order number', () => {
    assert.deepEqual(parseWorkOrderRef(ORDER_ID.toUpperCase()), { kind: 'id', id: ORDER_ID });
    assert.deepEqual(parseWorkOrderRef('OT-000123'), { kind: 'number', number: 123 });
    assert.deepEqual(parseWorkOrderRef(' 42 '), { kind: 'number', number: 42 });
    assert.equal(parseWorkOrderRef('DROP TABLE'), undefined);
  });
});

describe('redactSensitive', () => {
  it('masks nested secrets and keeps the rest', () => {
    assert.deepEqual(redactSensitive({ a: 1, hasUnlockCode: true, nested: [{ accessToken: 't', unitCost: 5, name: 'x' }] }), {
      a: 1,
      hasUnlockCode: true,
      nested: [{ accessToken: REDACTED, unitCost: REDACTED, name: 'x' }],
    });
  });
});

describe('HttpTallerApi', () => {
  it('logs in, retries once on 401 with a fresh token and reports API errors', async () => {
    const seen: string[] = [];
    let logins = 0;
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).replace('http://api', '');
      seen.push(`${init?.method} ${path} ${(init?.headers as Record<string, string>).Authorization ?? '-'}`);
      if (path === '/auth/login') return Response.json({ accessToken: `t${++logins}` });
      if ((init?.headers as Record<string, string>).Authorization === 'Bearer t1') return new Response(null, { status: 401 });
      return Response.json({ statusCode: 409, message: 'RN-04: transición ilegal' }, { status: 409 });
    }) as typeof fetch;

    const api = new HttpTallerApi({ baseUrl: 'http://api', username: 'agente', password: 'x' }, fakeFetch);

    await assert.rejects(api.get('/work-orders'), (error: unknown) => error instanceof TallerApiError && error.status === 409);
    assert.deepEqual(seen, [
      'POST /auth/login -',
      'GET /work-orders Bearer t1',
      'POST /auth/login -',
      'GET /work-orders Bearer t2',
    ]);
  });
});
