import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';
import { parseWorkOrderNumber } from './tracking-code';

const S = WorkOrderStatus;

// Orders still in the shop: everything except the two terminal states.
export const ACTIVE_STATUSES: readonly WorkOrderStatus[] = Object.values(S).filter(
  (status) => status !== S.DELIVERED && status !== S.CANCELLED,
);

// An active order is late when its promised date passed while the shop still
// owes work on it. READY_FOR_DELIVERY is excluded: the repair is done and the
// order only waits for the customer to pick the device up.
export const OVERDUE_STATUSES: readonly WorkOrderStatus[] = ACTIVE_STATUSES.filter((status) => status !== S.READY_FOR_DELIVERY);

// work_orders.number is a PostgreSQL INTEGER.
const MAX_WORK_ORDER_NUMBER = 2_147_483_647;

export interface WorkOrderSearch {
  // Matched (case-insensitive, partial) against IMEI, customer name and phone.
  text: string;
  // Set when the text reads as a work order number ("OT-000123", "123").
  number?: number;
}

export function parseWorkOrderSearch(raw: string | undefined): WorkOrderSearch | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  const number = parseWorkOrderNumber(text);
  return Number.isInteger(number) && number >= 1 && number <= MAX_WORK_ORDER_NUMBER ? { text, number } : { text };
}
