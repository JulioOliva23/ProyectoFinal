import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Observable, filter } from 'rxjs';
import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  AGENT_ACTION_TTL_MS,
  AgentAction,
  AgentActionStatus,
  checkDecision,
  isExpired,
  isVisibleTo,
  sanitizeAgentText,
} from '../../domain/agent-actions/agent-action-policy';
import { allowedNextStatuses, isWorkOrderStatus, rolesAllowedFor, transitionTable } from '../../domain/work-orders/work-order-state-machine';
import { WorkOrderDetailRow, WorkOrderRepository } from '../work-orders/repositories/work-order.repository';
import { WorkOrderTransitionService } from '../work-orders/services/work-order-transition.service';
import { AgentActionEvent, AgentActionStore } from './agent-action.store';
import { PreviewTransitionDto, ProposeTransitionDto, TransitionPreviewDto } from './dto/agent-action.dto';

const DECISION_ERRORS = {
  NOT_PENDING: () => new ConflictException('AG-01: la propuesta ya fue decidida'),
  EXPIRED: () => new ConflictException('AG-02: la propuesta venció; pide una nueva'),
  SELF_DECISION: () => new ForbiddenException('AG-04: quien propone no puede decidir su propia propuesta'),
  NOT_ASSIGNED: () => new ForbiddenException('RN-06: la orden no está asignada a este técnico'),
  ROLE_NOT_ALLOWED: () => new ForbiddenException('RN-04: tu rol no puede ejecutar esta transición'),
} as const;

@Injectable()
export class AgentActionsService {
  // Proposals being executed right now: a double click cannot run one twice.
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly store: AgentActionStore,
    private readonly workOrders: WorkOrderRepository,
    private readonly transitions: WorkOrderTransitionService,
  ) {}

  stateMachine(): ReturnType<typeof transitionTable> {
    return transitionTable();
  }

  // Dry run: tells the agent whether a proposal makes sense without changing anything.
  async preview(dto: PreviewTransitionDto, user: AuthenticatedUser): Promise<TransitionPreviewDto> {
    const order = await this.requireVisibleOrder(dto.workOrderId, user);
    const from = this.currentStatus(order);
    const approverRoles = rolesAllowedFor(from, dto.to);
    return {
      workOrderId: order.id,
      workOrderNumber: order.number,
      from,
      to: dto.to,
      legal: approverRoles.length > 0,
      approverRoles,
      legalNextStatuses: allowedNextStatuses(from),
      checksOnExecution: executionChecks(dto.to, order.technicianId),
    };
  }

  async propose(dto: ProposeTransitionDto, user: AuthenticatedUser): Promise<AgentAction> {
    const order = await this.requireVisibleOrder(dto.workOrderId, user);
    const from = this.currentStatus(order);
    const approverRoles = rolesAllowedFor(from, dto.to);
    if (approverRoles.length === 0) throw new ConflictException(`RN-04: transición ilegal ${from} → ${dto.to}`);

    const reason = sanitizeAgentText(dto.reason);
    if (reason.length < 10) throw new UnprocessableEntityException('AG-03: la justificación queda vacía tras sanitizarla');

    const now = new Date();
    return this.store.create({
      id: randomUUID(),
      workOrderId: order.id,
      workOrderNumber: order.number,
      technicianId: order.technicianId,
      from,
      to: dto.to,
      reason,
      approverRoles,
      status: AgentActionStatus.PENDING,
      requestedBy: { id: user.id, role: user.role },
      createdAt: now,
      expiresAt: new Date(now.getTime() + AGENT_ACTION_TTL_MS),
    });
  }

  list(user: AuthenticatedUser, status?: AgentActionStatus): AgentAction[] {
    return this.store
      .list()
      .map((action) => this.expireIfStale(action))
      .filter((action) => isVisibleTo(action, user) || action.requestedBy.id === user.id)
      .filter((action) => !status || action.status === status);
  }

  get(id: string, user: AuthenticatedUser): AgentAction {
    const action = this.store.find(id);
    if (!action || !(isVisibleTo(action, user) || action.requestedBy.id === user.id)) {
      throw new NotFoundException('Propuesta no encontrada');
    }
    return this.expireIfStale(action);
  }

  async approve(id: string, user: AuthenticatedUser, note?: string): Promise<AgentAction> {
    const action = this.requireDecidable(id, user, 'approve');
    if (this.inFlight.has(action.id)) throw new ConflictException('AG-01: la propuesta ya se está ejecutando');
    this.inFlight.add(action.id);
    try {
      // RN-04: the transition runs as the approver, through the only entry
      // point, so preconditions, Stock Guard and the audit trail all apply.
      await this.transitions.transition({
        workOrderId: action.workOrderId,
        to: action.to,
        userId: user.id,
        role: user.role,
        reason: auditReason(action, note),
      });
    } catch (error) {
      // The proposal stays pending: the person can fix the cause (e.g. stock) and retry.
      if (error instanceof HttpException) this.store.update(action.id, { lastError: error.message });
      throw error;
    } finally {
      this.inFlight.delete(action.id);
    }
    return this.store.update(action.id, this.decision(AgentActionStatus.EXECUTED, user, note));
  }

  reject(id: string, user: AuthenticatedUser, note?: string): AgentAction {
    const action = this.requireDecidable(id, user, 'reject');
    return this.store.update(action.id, this.decision(AgentActionStatus.REJECTED, user, note));
  }

  // Live feed for the approvals screen, filtered per user like list().
  stream(user: AuthenticatedUser): Observable<AgentActionEvent> {
    return this.store.events$.pipe(
      filter(({ action }) => isVisibleTo(action, user) || action.requestedBy.id === user.id),
    );
  }

  private requireDecidable(id: string, user: AuthenticatedUser, kind: 'approve' | 'reject'): AgentAction {
    const action = this.get(id, user);
    const check = checkDecision(action, user, kind, new Date());
    if (!check.allowed) throw DECISION_ERRORS[check.reason]();
    return action;
  }

  private decision(status: AgentActionStatus, user: AuthenticatedUser, note?: string): Partial<AgentAction> {
    return {
      status,
      decidedBy: { id: user.id, role: user.role },
      decisionNote: note ? sanitizeAgentText(note, 300) : undefined,
      decidedAt: new Date(),
      lastError: undefined,
    };
  }

  private expireIfStale(action: AgentAction): AgentAction {
    if (action.status !== AgentActionStatus.PENDING || !isExpired(action, new Date())) return action;
    return this.store.update(action.id, { status: AgentActionStatus.EXPIRED });
  }

  private async requireVisibleOrder(id: string, user: AuthenticatedUser): Promise<WorkOrderDetailRow> {
    const order = await this.workOrders.findDetail(id);
    if (!order) throw new NotFoundException('Work order not found');
    if (user.role === UserRole.TECHNICIAN && order.technicianId !== user.id) {
      throw new ForbiddenException('RN-06: work order is not assigned to this technician');
    }
    return order;
  }

  private currentStatus(order: WorkOrderDetailRow): WorkOrderStatus {
    if (!isWorkOrderStatus(order.status)) throw new UnprocessableEntityException(`Unknown persisted status ${order.status}`);
    return order.status;
  }
}

// RN-12: the audit row says the change came from an agent proposal and who approved it.
function auditReason(action: AgentAction, note?: string): string {
  const parts = [`[Agente IA · propuesta ${action.id.slice(0, 8)}] ${action.reason}`];
  if (note) parts.push(`Nota de aprobación: ${sanitizeAgentText(note, 300)}`);
  return parts.join(' · ').slice(0, 500);
}

function executionChecks(to: WorkOrderStatus, technicianId: string | null): string[] {
  const checks: string[] = [];
  if (to === WorkOrderStatus.IN_DIAGNOSIS) checks.push(technicianId ? 'RN-06: técnico asignado ✔' : 'RN-06: falta asignar técnico');
  if (to === WorkOrderStatus.BUDGETED) checks.push('RN-05: requiere un presupuesto enviado (SENT)');
  if (to === WorkOrderStatus.APPROVED) checks.push('RN-05: requiere un presupuesto aprobado por el cliente');
  if (to === WorkOrderStatus.IN_REPAIR) checks.push('RN-09: Stock Guard reservará los repuestos del presupuesto aprobado');
  if (to === WorkOrderStatus.QUALITY_CONTROL) checks.push('RN-09: se descontará el stock reservado');
  checks.push('RN-12: quedará en la auditoría con el usuario que apruebe');
  return checks;
}
