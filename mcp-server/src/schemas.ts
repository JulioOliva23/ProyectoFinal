import { z } from 'zod';

// Mirrors WorkOrderStatus in servicio_back (RN-04). The API re-validates.
export const WORK_ORDER_STATUSES = [
  'RECEIVED',
  'IN_DIAGNOSIS',
  'BUDGETED',
  'APPROVED',
  'IN_REPAIR',
  'QUALITY_CONTROL',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_NUMBER = /^(?:OT-?)?0*(\d{1,9})$/i;

export type WorkOrderRef = { kind: 'id'; id: string } | { kind: 'number'; number: number };

// Accepts the UUID or the number as people write it: "OT-000123", "ot123", "123".
export function parseWorkOrderRef(raw: string): WorkOrderRef | undefined {
  const value = raw.trim();
  if (UUID.test(value)) return { kind: 'id', id: value.toLowerCase() };
  const match = ORDER_NUMBER.exec(value);
  return match?.[1] ? { kind: 'number', number: Number(match[1]) } : undefined;
}

export function formatOrderNumber(number: number): string {
  return `OT-${String(number).padStart(6, '0')}`;
}

export const workOrderRefSchema = z
  .string()
  .min(1)
  .max(60)
  .refine((value) => parseWorkOrderRef(value) !== undefined, 'Usa el UUID de la orden o su número (OT-000123 / 123)')
  .describe('UUID de la orden o su número: "OT-000123", "123"');

export const statusSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase().replace(/[\s-]+/g, '_'))
  .pipe(z.enum(WORK_ORDER_STATUSES))
  .describe(`Estado destino: ${WORK_ORDER_STATUSES.join(', ')}`);

export const reasonSchema = z
  .string()
  .trim()
  .min(10, 'La justificación debe tener al menos 10 caracteres')
  .max(400, 'La justificación admite hasta 400 caracteres')
  .describe('Por qué se propone el cambio; lo verá la persona que aprueba');

export const searchOrdersShape = {
  search: z.string().trim().max(100).optional().describe('Número de OT, IMEI, nombre o teléfono del cliente'),
  status: statusSchema.optional(),
  page: z.number().int().min(1).max(500).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
};

export const orderRefShape = { orden: workOrderRefSchema };

export const transitionShape = { orden: workOrderRefSchema, estadoDestino: statusSchema };

export const proposeShape = { ...transitionShape, justificacion: reasonSchema };

export const actionIdShape = { propuestaId: z.uuid().describe('Id devuelto por proponer_transicion') };
