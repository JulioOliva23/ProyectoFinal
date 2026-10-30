import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { firstValueFrom, take, toArray } from 'rxjs';
import { UserRole } from '../src/common/enums/user-role.enum';
import { WorkOrderStatus as S } from '../src/common/enums/work-order-status.enum';
import { AgentActionStatus } from '../src/domain/agent-actions/agent-action-policy';
import { AgentActionStore } from '../src/modules/agent-actions/agent-action.store';
import { AgentActionsService } from '../src/modules/agent-actions/agent-actions.service';
import { WorkOrderDetailRow, WorkOrderRepository } from '../src/modules/work-orders/repositories/work-order.repository';
import { WorkOrderTransitionService } from '../src/modules/work-orders/services/work-order-transition.service';

describe('AgentActionsService', () => {
  const agent = { id: 'agent-user', role: UserRole.ADMIN };
  const technician = { id: 'tech-1', role: UserRole.TECHNICIAN };
  const workOrderId = '7d1f7c2e-1d5b-4e0a-9c1a-111111111111';
  let workOrders: jest.Mocked<Pick<WorkOrderRepository, 'findDetail'>>;
  let transitions: jest.Mocked<Pick<WorkOrderTransitionService, 'transition'>>;
  let store: AgentActionStore;
  let service: AgentActionsService;

  beforeEach(() => {
    workOrders = {
      findDetail: jest.fn().mockResolvedValue({ id: workOrderId, number: 42, status: S.APPROVED, technicianId: 'tech-1' } as WorkOrderDetailRow),
    };
    transitions = { transition: jest.fn().mockResolvedValue({ id: workOrderId, status: S.IN_REPAIR }) };
    store = new AgentActionStore();
    service = new AgentActionsService(store, workOrders as unknown as WorkOrderRepository, transitions as unknown as WorkOrderTransitionService);
  });

  const proposal = { workOrderId, to: S.IN_REPAIR, reason: 'Presupuesto aprobado y repuestos disponibles' };

  it('previews a transition without changing anything (dry run) [011/RF-1.1]', async () => {
    const preview = await service.preview({ workOrderId, to: S.IN_REPAIR }, agent);

    expect(preview).toMatchObject({ from: S.APPROVED, legal: true, approverRoles: [UserRole.TECHNICIAN, UserRole.ADMIN] });
    expect(preview.checksOnExecution.join(' ')).toContain('RN-09');
    expect(transitions.transition).not.toHaveBeenCalled();
  });

  it('files a proposal as pending without running the transition (AG-01) [011/RF-1.2]', async () => {
    const action = await service.propose(proposal, agent);

    expect(action).toMatchObject({ status: AgentActionStatus.PENDING, from: S.APPROVED, to: S.IN_REPAIR, workOrderNumber: 42 });
    expect(transitions.transition).not.toHaveBeenCalled();
  });

  it('refuses to propose an illegal transition (RN-04) [011/RF-1.3]', async () => {
    await expect(service.propose({ ...proposal, to: S.DELIVERED }, agent)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a reason that is empty once sanitized (AG-03) [011/RF-2.3]', async () => {
    await expect(service.propose({ ...proposal, reason: '<b></b>\u0000\u0000<i></i>' }, agent)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('runs the transition as the approver and records the agent origin in the audit reason (RN-04, RN-12) [011/RF-4.1]', async () => {
    const action = await service.propose(proposal, agent);

    const executed = await service.approve(action.id, technician, 'Revisado en mesa');

    expect(executed.status).toBe(AgentActionStatus.EXECUTED);
    expect(executed.decidedBy).toEqual(technician);
    expect(transitions.transition).toHaveBeenCalledWith(
      expect.objectContaining({ workOrderId, to: S.IN_REPAIR, userId: 'tech-1', role: UserRole.TECHNICIAN }),
    );
    expect(transitions.transition.mock.calls[0][0].reason).toMatch(/^\[Agente IA · propuesta .{8}\] Presupuesto aprobado/);
  });

  it('does not let the proposing account approve its own proposal (AG-04) [011/RF-3.1]', async () => {
    const action = await service.propose(proposal, agent);

    expect(() => service.reject(action.id, agent)).toThrow(ForbiddenException);
    await expect(service.approve(action.id, agent)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps the proposal pending with the error when the Stock Guard blocks it (RN-09) [011/RF-4.2]', async () => {
    transitions.transition.mockRejectedValueOnce(new UnprocessableEntityException('INSUFFICIENT_STOCK'));
    const action = await service.propose(proposal, agent);

    await expect(service.approve(action.id, technician)).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(service.get(action.id, technician)).toMatchObject({ status: AgentActionStatus.PENDING, lastError: 'INSUFFICIENT_STOCK' });
  });

  it('cannot run the same proposal twice at the same time (AG-01) [011/RF-3.4]', async () => {
    let finish: () => void = () => undefined;
    transitions.transition.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({ id: workOrderId, status: S.IN_REPAIR });
      }),
    );
    const action = await service.propose(proposal, agent);

    const first = service.approve(action.id, technician);
    await expect(service.approve(action.id, { id: 'admin-1', role: UserRole.ADMIN })).rejects.toBeInstanceOf(ConflictException);
    finish();
    await expect(first).resolves.toMatchObject({ status: AgentActionStatus.EXECUTED });
  });

  it('streams created and updated events only to users who can see the order (RN-06) [011/RF-6.1]', async () => {
    const forTechnician = firstValueFrom(service.stream(technician).pipe(take(2), toArray()));
    let otherTechnicianEvents = 0;
    const subscription = service.stream({ id: 'tech-2', role: UserRole.TECHNICIAN }).subscribe(() => otherTechnicianEvents++);

    const action = await service.propose(proposal, agent);
    service.reject(action.id, { id: 'rec-1', role: UserRole.RECEPTIONIST }, 'El cliente pidió esperar');

    const events = await forTechnician;
    subscription.unsubscribe();
    expect(events.map((event) => [event.type, event.action.status])).toEqual([
      ['created', AgentActionStatus.PENDING],
      ['updated', AgentActionStatus.REJECTED],
    ]);
    expect(otherTechnicianEvents).toBe(0);
  });

  it('marks a stale proposal as expired when it is read (AG-02) [011/RF-5.1]', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-30T12:00:00Z') });
    try {
      const action = await service.propose(proposal, agent);
      jest.setSystemTime(new Date('2026-10-30T12:16:00Z'));

      expect(service.list(technician, AgentActionStatus.EXPIRED).map((item) => item.id)).toEqual([action.id]);
    } finally {
      jest.useRealTimers();
    }
  });
});
