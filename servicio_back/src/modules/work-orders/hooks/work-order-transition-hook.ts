import { Prisma } from '../../../generated/prisma/client';
import { UserRole } from '../../../common/enums/user-role.enum';
import { WorkOrderStatus } from '../../../common/enums/work-order-status.enum';

export interface WorkOrderTransitionContext {
  workOrderId: string;
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  userId: string;
  role: UserRole;
  reason?: string;
}

// Lifecycle hook executed INSIDE the transition transaction. Throwing aborts
// the whole transition (status change, stock movements and audit row).
export interface WorkOrderTransitionHook {
  readonly name: string;
  supports(context: WorkOrderTransitionContext): boolean;
  handle(context: WorkOrderTransitionContext, transaction: Prisma.TransactionClient): Promise<void>;
}

export const WORK_ORDER_TRANSITION_HOOKS = Symbol('WORK_ORDER_TRANSITION_HOOKS');
