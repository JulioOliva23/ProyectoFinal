import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { WorkOrderStatus } from '../../../common/enums/work-order-status.enum';
import { WorkOrderRepository } from '../repositories/work-order.repository';
import { WorkOrderTransitionContext, WorkOrderTransitionHook } from './work-order-transition-hook';

// Runs first. Keeps the work order consistent with the aggregates around it,
// whichever endpoint triggered the transition:
// * → IN_DIAGNOSIS needs an assigned technician (RN-06).
// * → BUDGETED needs a SENT budget; → APPROVED needs an APPROVED budget (RN-05).
//   The budget service updates the budget first, in the same transaction.
@Injectable()
export class WorkflowPreconditionsHook implements WorkOrderTransitionHook {
  readonly name = 'workflow-preconditions';

  constructor(private readonly workOrders: WorkOrderRepository) {}

  supports({ to }: WorkOrderTransitionContext): boolean {
    return [WorkOrderStatus.IN_DIAGNOSIS, WorkOrderStatus.BUDGETED, WorkOrderStatus.APPROVED].includes(to);
  }

  async handle(context: WorkOrderTransitionContext, transaction: Prisma.TransactionClient): Promise<void> {
    if (context.to === WorkOrderStatus.IN_DIAGNOSIS) {
      if (!(await this.workOrders.hasTechnician(transaction, context.workOrderId))) {
        throw new UnprocessableEntityException('RN-06: assign a technician before starting the diagnosis');
      }
      return;
    }
    const required = context.to === WorkOrderStatus.BUDGETED ? 'SENT' : 'APPROVED';
    if (!(await this.workOrders.hasBudgetInStatus(transaction, context.workOrderId, required))) {
      throw new UnprocessableEntityException(
        context.to === WorkOrderStatus.BUDGETED
          ? 'RN-05: send a budget to the customer to mark the order as budgeted'
          : 'RN-05: the customer must approve the budget through the budget approval endpoint',
      );
    }
  }
}
