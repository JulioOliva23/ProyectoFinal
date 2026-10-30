import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { TallerApiError, type TallerApi } from './api-client.js';
import { redactSensitive } from './redact.js';
import {
  actionIdShape,
  formatOrderNumber,
  orderRefShape,
  parseWorkOrderRef,
  proposeShape,
  searchOrdersShape,
  transitionShape,
} from './schemas.js';

export const SERVER_NAME = 'taller';

interface WorkOrderSummary {
  id: string;
  number: number;
  status: string;
}

interface AgentActionResponse {
  id: string;
  workOrderNumber: number;
  from: string;
  to: string;
  status: string;
  expiresAt: string;
}

// AG-01: read tools are free; the only write tool files a proposal that a
// person approves in the web app (/aprobaciones). Nothing here changes a work
// order by itself.
export function createTallerServer(api: TallerApi): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: '0.1.0' },
    {
      instructions:
        'Servidor del servicio técnico de celulares. Consulta órdenes (OT), auditoría y stock. ' +
        'Para cambiar el estado de una OT: primero simular_transicion, luego proponer_transicion; ' +
        'el cambio solo ocurre cuando una persona lo aprueba en la app web. Nunca digas que una OT cambió de estado ' +
        'hasta que consultar_propuesta devuelva EXECUTED.',
    },
  );

  const resolveOrderId = async (raw: string): Promise<string> => {
    const ref = parseWorkOrderRef(raw);
    if (!ref) throw new TallerApiError(400, `Referencia de orden inválida: ${raw}`);
    if (ref.kind === 'id') return ref.id;
    const number = formatOrderNumber(ref.number);
    const page = await api.get<{ data: WorkOrderSummary[] }>(`/work-orders?search=${encodeURIComponent(number)}&pageSize=5`);
    const match = page.data.find((order) => order.number === ref.number);
    if (!match) throw new TallerApiError(404, `No existe la orden ${number} o no tienes acceso a ella`);
    return match.id;
  };

  server.registerTool(
    'buscar_ordenes',
    {
      title: 'Buscar órdenes de trabajo',
      description: 'Lista OTs paginadas, filtrando por texto (número, IMEI, cliente) y/o estado.',
      inputSchema: searchOrdersShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ search, status, page, pageSize }) =>
      safely(() => {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (search) query.set('search', search);
        if (status) query.set('status', status);
        return api.get(`/work-orders?${query.toString()}`);
      }),
  );

  server.registerTool(
    'ver_orden',
    {
      title: 'Ver orden de trabajo',
      description: 'Detalle de una OT: estado, equipo, cliente, técnico y diagnóstico. Nunca incluye el código de desbloqueo (RN-03).',
      inputSchema: orderRefShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ orden }) => safely(async () => api.get(`/work-orders/${await resolveOrderId(orden)}`)),
  );

  server.registerTool(
    'ver_auditoria_orden',
    {
      title: 'Auditoría de la orden',
      description: 'Historial inmutable de cambios de estado de una OT: quién, cuándo y por qué (RN-12).',
      inputSchema: orderRefShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ orden }) => safely(async () => api.get(`/work-orders/${await resolveOrderId(orden)}/audit`)),
  );

  server.registerTool(
    'consultar_stock_bajo',
    {
      title: 'Repuestos con stock bajo',
      description: 'Repuestos cuyo stock disponible está en o por debajo del mínimo (RN-11).',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => safely(() => api.get('/spare-parts/alerts/low-stock')),
  );

  server.registerTool(
    'simular_transicion',
    {
      title: 'Simular cambio de estado',
      description:
        'Dry run: dice si la transición es legal desde el estado actual, qué roles pueden aprobarla y qué ' +
        'precondiciones se verificarán (presupuesto, Stock Guard). No cambia nada.',
      inputSchema: transitionShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ orden, estadoDestino }) =>
      safely(async () => api.post('/agent-actions/preview', { workOrderId: await resolveOrderId(orden), to: estadoDestino })),
  );

  server.registerTool(
    'proponer_transicion',
    {
      title: 'Proponer cambio de estado (requiere aprobación humana)',
      description:
        'Registra una propuesta PENDIENTE de cambio de estado. NO ejecuta el cambio: una persona distinta la ' +
        'aprueba o rechaza en la app web (/aprobaciones) y vence a los 15 minutos. Devuelve el id de la propuesta.',
      inputSchema: proposeShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ orden, estadoDestino, justificacion }) =>
      safely(async () => {
        const action = await api.post<AgentActionResponse>('/agent-actions', {
          workOrderId: await resolveOrderId(orden),
          to: estadoDestino,
          reason: justificacion,
        });
        return {
          ...action,
          siguientePaso: `Pendiente de aprobación humana en /aprobaciones hasta ${action.expiresAt}. No reintentes.`,
        };
      }),
  );

  server.registerTool(
    'consultar_propuesta',
    {
      title: 'Estado de una propuesta',
      description: 'PENDING, EXECUTED, REJECTED o EXPIRED, con quién decidió y el último error de ejecución si lo hubo.',
      inputSchema: actionIdShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ propuestaId }) => safely(() => api.get(`/agent-actions/${propuestaId}`)),
  );

  registerResources(server, api, resolveOrderId);
  return server;
}

function registerResources(server: McpServer, api: TallerApi, resolveOrderId: (raw: string) => Promise<string>): void {
  server.registerResource(
    'maquina-estados',
    'taller://reglas/maquina-estados',
    {
      title: 'Máquina de estados de la OT',
      description: 'Transiciones legales y roles que pueden ejecutarlas (RN-04). Fuente: servicio_back.',
      mimeType: 'application/json',
    },
    (uri) => readJson(uri.href, () => api.get('/agent-actions/state-machine')),
  );

  server.registerResource(
    'stock-bajo',
    'taller://inventario/stock-bajo',
    { title: 'Alertas de stock bajo', description: 'RN-11', mimeType: 'application/json' },
    (uri) => readJson(uri.href, () => api.get('/spare-parts/alerts/low-stock')),
  );

  server.registerResource(
    'propuestas-pendientes',
    'taller://propuestas/pendientes',
    { title: 'Propuestas pendientes', description: 'Propuestas del agente que esperan decisión humana (AG-01)', mimeType: 'application/json' },
    (uri) => readJson(uri.href, () => api.get('/agent-actions?status=PENDING')),
  );

  server.registerResource(
    'orden',
    new ResourceTemplate('taller://ordenes/{orden}', { list: undefined }),
    { title: 'Orden de trabajo', description: 'Detalle de una OT por UUID o número (taller://ordenes/OT-000123)', mimeType: 'application/json' },
    (uri, { orden }) => readJson(uri.href, async () => api.get(`/work-orders/${await resolveOrderId(String(orden))}`)),
  );
}

async function safely(work: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(redactSensitive(await work()), null, 2) }] };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: describeError(error) }] };
  }
}

async function readJson(uri: string, work: () => Promise<unknown>): Promise<ReadResourceResult> {
  try {
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(redactSensitive(await work()), null, 2) }] };
  } catch (error) {
    return { contents: [{ uri, mimeType: 'text/plain', text: describeError(error) }] };
  }
}

// Errors the model can act on: HTTP status, domain code (e.g. INSUFFICIENT_STOCK) and message.
export function describeError(error: unknown): string {
  if (error instanceof TallerApiError) {
    const code = error.code ? ` ${error.code}` : '';
    return `Error ${error.status}${code}: ${error.message}`;
  }
  return `Error inesperado: ${error instanceof Error ? error.message : String(error)}`;
}
