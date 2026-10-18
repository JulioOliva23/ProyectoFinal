import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';

// GEN-01: technical enums in English, UI labels in Spanish.
export const WORK_ORDER_STATUS_LABELS: Readonly<Record<WorkOrderStatus, string>> = {
  [WorkOrderStatus.RECEIVED]: 'Ingresado',
  [WorkOrderStatus.IN_DIAGNOSIS]: 'En Diagnóstico',
  [WorkOrderStatus.BUDGETED]: 'Presupuestado',
  [WorkOrderStatus.APPROVED]: 'Aprobado',
  [WorkOrderStatus.IN_REPAIR]: 'En Reparación',
  [WorkOrderStatus.QUALITY_CONTROL]: 'Control de Calidad',
  [WorkOrderStatus.READY_FOR_DELIVERY]: 'Listo para Entrega',
  [WorkOrderStatus.DELIVERED]: 'Entregado',
  [WorkOrderStatus.CANCELLED]: 'Cancelado',
};
