import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../src/common/enums/user-role.enum';
import { WorkOrderStatus as S } from '../src/common/enums/work-order-status.enum';
import { AuditTrailHook } from '../src/modules/work-orders/hooks/audit-trail.hook';
import { WorkOrderTransitionHook } from '../src/modules/work-orders/hooks/work-order-transition-hook';
import { WorkOrderAuditRepository } from '../src/modules/work-orders/repositories/work-order-audit.repository';
import { WorkOrderTransitionRepository } from '../src/modules/work-orders/repositories/work-order-transition.repository';
import { WorkOrderTransitionService } from '../src/modules/work-orders/services/work-order-transition.service';
import { Prisma } from '../src/generated/prisma/client';

describe('WorkOrderTransitionService', () => {
  const tx = {} as Prisma.TransactionClient;
  let repository: jest.Mocked<Pick<WorkOrderTransitionRepository, 'runInTransaction' | 'findForTransition' | 'compareAndSetStatus'>>;
  let audit: jest.Mocked<Pick<WorkOrderAuditRepository, 'append'>>;
  let guard: jest.Mocked<WorkOrderTransitionHook>;
  let service: WorkOrderTransitionService;

  beforeEach(() => {
    repository = {
      runInTransaction: jest.fn((work) => work(tx)) as never,
      findForTransition: jest.fn(),
      compareAndSetStatus: jest.fn().mockResolvedValue(true),
    };
    audit = { append: jest.fn().mockResolvedValue(undefined) };
    guard = { name: 'guard', supports: jest.fn().mockReturnValue(true), handle: jest.fn().mockResolvedValue(undefined) };
    service = new WorkOrderTransitionService(repository as unknown as WorkOrderTransitionRepository, [
      guard,
      new AuditTrailHook(audit as unknown as WorkOrderAuditRepository),
    ]);
  });

  const request = { workOrderId: 'wo-1', to: S.IN_REPAIR, userId: 'tech-1', role: UserRole.TECHNICIAN };

  it('applies the transition, runs hooks and writes the audit row (RN-12) [004/RF-7.1]', async () => {
    repository.findForTransition.mockResolvedValue({ id: 'wo-1', status: S.APPROVED, technicianId: 'tech-1' });

    await expect(service.transition(request)).resolves.toEqual({ id: 'wo-1', status: S.IN_REPAIR });

    expect(repository.compareAndSetStatus).toHaveBeenCalledWith(tx, 'wo-1', S.APPROVED, S.IN_REPAIR);
    expect(guard.handle).toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith(tx, {
      workOrderId: 'wo-1',
      userId: 'tech-1',
      previousStatus: S.APPROVED,
      newStatus: S.IN_REPAIR,
      reason: undefined,
    });
  });

  it('propagates a stock guard failure so the transaction rolls back and no audit is written [004/RF-7.2]', async () => {
    repository.findForTransition.mockResolvedValue({ id: 'wo-1', status: S.APPROVED, technicianId: 'tech-1' });
    guard.handle.mockRejectedValue(new Error('INSUFFICIENT_STOCK'));

    await expect(service.transition(request)).rejects.toThrow('INSUFFICIENT_STOCK');
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('rejects a technician moving an order not assigned to them (RN-06) [004/RF-3.2]', async () => {
    repository.findForTransition.mockResolvedValue({ id: 'wo-1', status: S.APPROVED, technicianId: 'other' });
    await expect(service.transition(request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects illegal transitions with 409 (RN-04) [004/RF-1.3]', async () => {
    repository.findForTransition.mockResolvedValue({ id: 'wo-1', status: S.BUDGETED, technicianId: 'tech-1' });
    await expect(service.transition(request)).rejects.toBeInstanceOf(ConflictException);
    expect(guard.handle).not.toHaveBeenCalled();
  });

  it('fails on a lost compare-and-set race before running hooks [004/RF-8.1]', async () => {
    repository.findForTransition.mockResolvedValue({ id: 'wo-1', status: S.APPROVED, technicianId: 'tech-1' });
    repository.compareAndSetStatus.mockResolvedValue(false);
    await expect(service.transition(request)).rejects.toBeInstanceOf(ConflictException);
    expect(guard.handle).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown work order [004/RF-1.3]', async () => {
    repository.findForTransition.mockResolvedValue(null);
    await expect(service.transition(request)).rejects.toBeInstanceOf(NotFoundException);
  });
});
