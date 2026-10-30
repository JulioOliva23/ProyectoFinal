import { UnprocessableEntityException } from '@nestjs/common';
import { UserRole } from '../src/common/enums/user-role.enum';
import { WorkOrderStatus as S } from '../src/common/enums/work-order-status.enum';
import { Prisma } from '../src/generated/prisma/client';
import { WorkflowPreconditionsHook } from '../src/modules/work-orders/hooks/workflow-preconditions.hook';
import { WorkOrderRepository } from '../src/modules/work-orders/repositories/work-order.repository';

describe('WorkflowPreconditionsHook', () => {
  const tx = {} as Prisma.TransactionClient;
  const ctx = (from: S, to: S) => ({ workOrderId: 'wo-1', from, to, userId: 'u', role: UserRole.ADMIN });
  let repository: jest.Mocked<Pick<WorkOrderRepository, 'hasTechnician' | 'hasBudgetInStatus'>>;
  let hook: WorkflowPreconditionsHook;

  beforeEach(() => {
    repository = { hasTechnician: jest.fn().mockResolvedValue(true), hasBudgetInStatus: jest.fn().mockResolvedValue(true) };
    hook = new WorkflowPreconditionsHook(repository as unknown as WorkOrderRepository);
  });

  it('requires an assigned technician to start the diagnosis (RN-06) [004/RF-4.1]', async () => {
    repository.hasTechnician.mockResolvedValue(false);
    await expect(hook.handle(ctx(S.RECEIVED, S.IN_DIAGNOSIS), tx)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('requires a SENT budget to become BUDGETED [004/RF-4.2]', async () => {
    await hook.handle(ctx(S.IN_DIAGNOSIS, S.BUDGETED), tx);
    expect(repository.hasBudgetInStatus).toHaveBeenCalledWith(tx, 'wo-1', 'SENT');
  });

  it('blocks APPROVED without an approved budget (RN-05) [004/RF-4.3]', async () => {
    repository.hasBudgetInStatus.mockResolvedValue(false);
    await expect(hook.handle(ctx(S.BUDGETED, S.APPROVED), tx)).rejects.toThrow('RN-05');
  });

  it('ignores unrelated transitions [004/RF-4.3]', () => {
    expect(hook.supports(ctx(S.IN_REPAIR, S.QUALITY_CONTROL))).toBe(false);
  });
});
