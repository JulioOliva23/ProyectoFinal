import { UserRole } from '../../common/enums/user-role.enum';
import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';

const S = WorkOrderStatus;
const R = UserRole;

// RN-04: the only legal work order transitions and the roles allowed to
// trigger each one. Anything not listed here is rejected.
const TRANSITIONS: Readonly<Record<WorkOrderStatus, Partial<Record<WorkOrderStatus, readonly UserRole[]>>>> = {
  [S.RECEIVED]: {
    [S.IN_DIAGNOSIS]: [R.TECHNICIAN, R.ADMIN],
    [S.CANCELLED]: [R.RECEPTIONIST, R.ADMIN],
  },
  [S.IN_DIAGNOSIS]: {
    [S.BUDGETED]: [R.TECHNICIAN, R.RECEPTIONIST, R.ADMIN],
    [S.CANCELLED]: [R.RECEPTIONIST, R.ADMIN],
  },
  [S.BUDGETED]: {
    // RN-05: approval is recorded by front desk on behalf of the customer.
    [S.APPROVED]: [R.RECEPTIONIST, R.ADMIN],
    [S.CANCELLED]: [R.RECEPTIONIST, R.ADMIN],
  },
  [S.APPROVED]: {
    // RN-09: guarded by the inventory stock guard hook.
    [S.IN_REPAIR]: [R.TECHNICIAN, R.ADMIN],
  },
  [S.IN_REPAIR]: {
    [S.QUALITY_CONTROL]: [R.TECHNICIAN, R.ADMIN],
  },
  [S.QUALITY_CONTROL]: {
    [S.READY_FOR_DELIVERY]: [R.TECHNICIAN, R.ADMIN],
    // Failed QC: rework without touching the reserved/consumed parts again.
    [S.IN_REPAIR]: [R.TECHNICIAN, R.ADMIN],
  },
  [S.READY_FOR_DELIVERY]: {
    [S.DELIVERED]: [R.RECEPTIONIST, R.ADMIN],
  },
  [S.DELIVERED]: {},
  // A cancelled order still returns the device to its owner.
  [S.CANCELLED]: {
    [S.DELIVERED]: [R.RECEPTIONIST, R.ADMIN],
  },
};

export type TransitionCheck =
  | { allowed: true }
  | { allowed: false; reason: 'ILLEGAL_TRANSITION' | 'ROLE_NOT_ALLOWED' };

export function checkTransition(from: WorkOrderStatus, to: WorkOrderStatus, role: UserRole): TransitionCheck {
  const roles = TRANSITIONS[from]?.[to];
  if (!roles) return { allowed: false, reason: 'ILLEGAL_TRANSITION' };
  if (!roles.includes(role)) return { allowed: false, reason: 'ROLE_NOT_ALLOWED' };
  return { allowed: true };
}

export function allowedNextStatuses(from: WorkOrderStatus): WorkOrderStatus[] {
  return Object.keys(TRANSITIONS[from] ?? {}) as WorkOrderStatus[];
}

// FE-08: what the UI may offer a given role; the transition service still
// re-checks everything (ownership included).
export function allowedTransitionsFor(from: WorkOrderStatus, role: UserRole): WorkOrderStatus[] {
  return allowedNextStatuses(from).filter((to) => checkTransition(from, to, role).allowed);
}

export function isWorkOrderStatus(value: string): value is WorkOrderStatus {
  return (Object.values(WorkOrderStatus) as string[]).includes(value);
}
