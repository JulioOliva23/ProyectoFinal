import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { UserRole } from '../../../common/enums/user-role.enum';
import { WorkOrderStatus } from '../../../common/enums/work-order-status.enum';
import { checkTransition, isWorkOrderStatus } from '../../../domain/work-orders/work-order-state-machine';
import { WORK_ORDER_STATUS_LABELS } from '../../../domain/work-orders/work-order-status-labels';
import {
  WORK_ORDER_TRANSITION_HOOKS,
  WorkOrderTransitionContext,
  WorkOrderTransitionHook,
} from '../hooks/work-order-transition-hook';
import { WorkOrderTransitionRepository } from '../repositories/work-order-transition.repository';

export interface TransitionResult {
  id: string;
  status: WorkOrderStatus;
}

export interface TransitionRequest {
  workOrderId: string;
  to: WorkOrderStatus;
  userId: string;
  role: UserRole;
  reason?: string;
}

// RN-04 entry point: every status change MUST go through here so the state
// machine, RBAC ownership and hooks (stock guard, audit trail) always apply.
@Injectable()
export class WorkOrderTransitionService {
  constructor(
    private readonly repository: WorkOrderTransitionRepository,
    @Inject(WORK_ORDER_TRANSITION_HOOKS) private readonly hooks: WorkOrderTransitionHook[],
  ) {}

  transition(request: TransitionRequest): Promise<TransitionResult> {
    return this.repository.runInTransaction((transaction) => this.transitionWithin(transaction, request));
  }

  // For callers that must change their own aggregate atomically with the
  // status change (e.g. a budget approval). Never call outside a transaction.
  async transitionWithin(transaction: Prisma.TransactionClient, request: TransitionRequest): Promise<TransitionResult> {
    const order = await this.repository.findForTransition(transaction, request.workOrderId);
    if (!order) throw new NotFoundException('La orden de trabajo no existe');
    if (!isWorkOrderStatus(order.status)) {
      throw new UnprocessableEntityException(`Estado guardado desconocido: ${order.status}`);
    }

    // RN-06: a technician only moves orders assigned to them.
    if (request.role === UserRole.TECHNICIAN && order.technicianId !== request.userId) {
      throw new ForbiddenException('RN-06: la orden no está asignada a este técnico');
    }

    const check = checkTransition(order.status, request.to, request.role);
    if (!check.allowed) {
      if (check.reason === 'ROLE_NOT_ALLOWED') {
        throw new ForbiddenException(`RN-04: el rol ${request.role} no puede pasar la orden de ${WORK_ORDER_STATUS_LABELS[order.status]} a ${WORK_ORDER_STATUS_LABELS[request.to]}`);
      }
      throw new ConflictException(`RN-04: transición no permitida: de ${WORK_ORDER_STATUS_LABELS[order.status]} a ${WORK_ORDER_STATUS_LABELS[request.to]}`);
    }

    // Compare-and-set first: it takes the row lock, so a concurrent
    // transition of the same order fails here before touching any stock.
    const applied = await this.repository.compareAndSetStatus(transaction, order.id, order.status, request.to);
    if (!applied) throw new ConflictException('La orden cambió mientras tanto, vuelva a intentarlo');

    const context: WorkOrderTransitionContext = { ...request, from: order.status };
    // Hooks run in registration order (audit trail last). Any throw rolls
    // back the status change as well.
    for (const hook of this.hooks) {
      if (hook.supports(context)) await hook.handle(context, transaction);
    }

    return { id: order.id, status: request.to };
  }
}
