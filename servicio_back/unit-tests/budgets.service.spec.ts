import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../src/generated/prisma/client';
import { UserRole } from '../src/common/enums/user-role.enum';
import { WorkOrderStatus } from '../src/common/enums/work-order-status.enum';
import { BudgetsService } from '../src/modules/budgets/budgets.service';
import { BudgetItemType, DecisionChannel } from '../src/modules/budgets/dto/budget-enums';
import { BudgetRepository, BudgetRow } from '../src/modules/budgets/repositories/budget.repository';
import { AppConfigService } from '../src/modules/config/app-config.service';
import { SparePartsService } from '../src/modules/spare-parts/spare-parts.service';
import { WorkOrderTransitionService } from '../src/modules/work-orders/services/work-order-transition.service';

const user = { id: 'recep-1', role: UserRole.RECEPTIONIST };
const D = (value: string) => new Prisma.Decimal(value);

function budget(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    id: 'b1',
    workOrderId: 'wo-1',
    version: 1,
    status: 'SENT',
    laborSubtotal: D('150'),
    partsSubtotal: D('980'),
    total: D('1130'),
    currency: 'BOB',
    expiresAt: new Date(Date.now() + 86_400_000),
    sentAt: new Date(),
    decidedAt: null,
    decisionChannel: null,
    rejectionReason: null,
    items: [],
    ...overrides,
  };
}

describe('BudgetsService', () => {
  const tx = {} as Prisma.TransactionClient;
  let repository: jest.Mocked<BudgetRepository>;
  let spareParts: jest.Mocked<Pick<SparePartsService, 'priceCompatibleParts'>>;
  let transitions: jest.Mocked<Pick<WorkOrderTransitionService, 'transitionWithin'>>;
  let service: BudgetsService;

  beforeEach(() => {
    repository = {
      findWorkOrderContext: jest.fn().mockResolvedValue({ id: 'wo-1', status: WorkOrderStatus.IN_DIAGNOSIS, device: { deviceModelId: 'model-1' } }),
      findById: jest.fn().mockResolvedValue(budget()),
      create: jest.fn().mockImplementation(async (input) => budget({ ...input, status: 'DRAFT', items: [] })),
      runInTransaction: jest.fn((work) => work(tx)),
      changeStatus: jest.fn().mockResolvedValue(true),
      supersedeOthers: jest.fn(),
      markExpired: jest.fn(),
    } as unknown as jest.Mocked<BudgetRepository>;
    spareParts = {
      priceCompatibleParts: jest.fn().mockResolvedValue(new Map([['p1', { id: 'p1', name: 'OLED', workshopPrice: D('980.00') }]])),
    };
    transitions = { transitionWithin: jest.fn().mockResolvedValue({ id: 'wo-1', status: WorkOrderStatus.APPROVED }) };
    const config = { getBudgetValidityDays: () => 7 } as AppConfigService;
    service = new BudgetsService(
      repository,
      spareParts as unknown as SparePartsService,
      transitions as unknown as WorkOrderTransitionService,
      config,
    );
  });

  it('computes labor + catalog-priced parts with Decimal arithmetic (RN-15)', async () => {
    const result = await service.create(
      'wo-1',
      {
        items: [
          { itemType: BudgetItemType.LABOR, description: 'Micro-soldadura', quantity: 1, unitPrice: '150.10' },
          { itemType: BudgetItemType.LABOR, description: 'Ensamblaje', quantity: 2, unitPrice: '0.20' },
          { itemType: BudgetItemType.PART, description: 'OLED', sparePartId: 'p1', quantity: 1 },
        ],
      },
      user,
    );
    expect(spareParts.priceCompatibleParts).toHaveBeenCalledWith(['p1'], 'model-1');
    expect(result).toMatchObject({ laborSubtotal: '150.50', partsSubtotal: '980.00', total: '1130.50' });
  });

  it('refuses to draft a budget once the repair was approved', async () => {
    repository.findWorkOrderContext.mockResolvedValue({ id: 'wo-1', status: WorkOrderStatus.APPROVED, device: { deviceModelId: 'm' } } as never);
    await expect(service.create('wo-1', { items: [] }, user)).rejects.toBeInstanceOf(ConflictException);
  });

  it('sending the first budget moves the order to BUDGETED in the same transaction', async () => {
    repository.findById.mockResolvedValue(budget({ status: 'DRAFT' }));
    await service.send('b1', user);
    expect(repository.changeStatus).toHaveBeenCalledWith(tx, 'b1', 'DRAFT', expect.objectContaining({ status: 'SENT' }));
    expect(transitions.transitionWithin).toHaveBeenCalledWith(tx, expect.objectContaining({ to: WorkOrderStatus.BUDGETED }));
  });

  it('approval marks the budget and moves the order to APPROVED atomically (RN-05)', async () => {
    await service.approve('b1', { channel: DecisionChannel.WHATSAPP }, user);
    expect(repository.changeStatus).toHaveBeenCalledWith(
      tx,
      'b1',
      'SENT',
      expect.objectContaining({ status: 'APPROVED', decisionChannel: 'WHATSAPP', decidedBy: 'recep-1' }),
    );
    expect(transitions.transitionWithin).toHaveBeenCalledWith(tx, expect.objectContaining({ to: WorkOrderStatus.APPROVED }));
  });

  it('rejects approval of an expired budget and marks it EXPIRED (RN-08)', async () => {
    repository.findById.mockResolvedValue(budget({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.approve('b1', { channel: DecisionChannel.PHONE }, user)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.markExpired).toHaveBeenCalledWith('b1');
    expect(transitions.transitionWithin).not.toHaveBeenCalled();
  });

  it('rejection cancels the work order with the reason', async () => {
    await service.reject('b1', { channel: DecisionChannel.IN_PERSON, reason: 'Muy caro' }, user);
    expect(transitions.transitionWithin).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ to: WorkOrderStatus.CANCELLED, reason: 'Budget rejected: Muy caro' }),
    );
  });

  it('only SENT budgets can be decided', async () => {
    repository.findById.mockResolvedValue(budget({ status: 'DRAFT' }));
    await expect(service.approve('b1', { channel: DecisionChannel.PHONE }, user)).rejects.toBeInstanceOf(ConflictException);
  });
});
