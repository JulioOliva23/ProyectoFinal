// GEN-02 / RN-04: fixed English status vocabulary for work orders.
// UI labels stay in Spanish (see AI_CONTEXT.md, "Máquina de estados").
export enum WorkOrderStatus {
  RECEIVED = 'RECEIVED',
  IN_DIAGNOSIS = 'IN_DIAGNOSIS',
  BUDGETED = 'BUDGETED',
  APPROVED = 'APPROVED',
  IN_REPAIR = 'IN_REPAIR',
  QUALITY_CONTROL = 'QUALITY_CONTROL',
  READY_FOR_DELIVERY = 'READY_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  // Terminal branch: the customer rejected the budget or it expired.
  CANCELLED = 'CANCELLED',
}
