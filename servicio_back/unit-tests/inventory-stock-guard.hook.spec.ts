import { UnprocessableEntityException } from '@nestjs/common';
import { UserRole } from '../src/common/enums/user-role.enum';
import { WorkOrderStatus } from '../src/common/enums/work-order-status.enum';
import { InventoryStockGuardHook } from '../src/modules/work-orders/hooks/inventory-stock-guard.hook';
import { WorkOrderTransitionContext } from '../src/modules/work-orders/hooks/work-order-transition-hook';
import { SparePartStockRepository } from '../src/modules/spare-parts/repositories/spare-part-stock.repository';
import { Prisma } from '../src/generated/prisma/client';

describe('InventoryStockGuardHook (RN-09)', () => {
  const tx = {} as Prisma.TransactionClient;
  const base: WorkOrderTransitionContext = {
    workOrderId: 'wo-1',
    from: WorkOrderStatus.APPROVED,
    to: WorkOrderStatus.IN_REPAIR,
    userId: 'tech-1',
    role: UserRole.TECHNICIAN,
  };
  let stock: jest.Mocked<Pick<SparePartStockRepository, 'reserve' | 'consume' | 'findApprovedPartLines'>>;
  let hook: InventoryStockGuardHook;

  beforeEach(() => {
    stock = { reserve: jest.fn(), consume: jest.fn(), findApprovedPartLines: jest.fn() };
    hook = new InventoryStockGuardHook(stock as unknown as SparePartStockRepository);
  });

  it('only intercepts IN_REPAIR and QUALITY_CONTROL', () => {
    expect(hook.supports(base)).toBe(true);
    expect(hook.supports({ ...base, to: WorkOrderStatus.QUALITY_CONTROL })).toBe(true);
    expect(hook.supports({ ...base, to: WorkOrderStatus.DELIVERED })).toBe(false);
  });

  it('reserves every pending part line when entering IN_REPAIR', async () => {
    stock.findApprovedPartLines.mockResolvedValue([
      { budgetItemId: 'i1', sparePartId: 'p1', quantity: 1 },
      { budgetItemId: 'i2', sparePartId: 'p2', quantity: 2 },
    ]);
    stock.reserve.mockResolvedValue(true);

    await hook.handle(base, tx);

    expect(stock.findApprovedPartLines).toHaveBeenCalledWith(tx, 'wo-1', 'PENDING');
    expect(stock.reserve).toHaveBeenCalledTimes(2);
  });

  it('blocks the transition listing every part without stock', async () => {
    stock.findApprovedPartLines.mockResolvedValue([
      { budgetItemId: 'i1', sparePartId: 'p1', quantity: 1 },
      { budgetItemId: 'i2', sparePartId: 'p2', quantity: 5 },
    ]);
    stock.reserve.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const error = await hook.handle(base, tx).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      sparePartIds: ['p2'],
    });
  });

  it('is a no-op on QC rework when nothing is pending', async () => {
    stock.findApprovedPartLines.mockResolvedValue([]);
    await expect(hook.handle({ ...base, from: WorkOrderStatus.QUALITY_CONTROL }, tx)).resolves.toBeUndefined();
    expect(stock.reserve).not.toHaveBeenCalled();
  });

  it('consumes reserved lines when entering QUALITY_CONTROL', async () => {
    stock.findApprovedPartLines.mockResolvedValue([{ budgetItemId: 'i1', sparePartId: 'p1', quantity: 1 }]);
    stock.consume.mockResolvedValue(true);

    await hook.handle({ ...base, from: WorkOrderStatus.IN_REPAIR, to: WorkOrderStatus.QUALITY_CONTROL }, tx);

    expect(stock.findApprovedPartLines).toHaveBeenCalledWith(tx, 'wo-1', 'RESERVED');
    expect(stock.consume).toHaveBeenCalledTimes(1);
  });
});
