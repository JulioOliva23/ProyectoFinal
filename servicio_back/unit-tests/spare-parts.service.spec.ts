import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../src/generated/prisma/client';
import { UserRole } from '../src/common/enums/user-role.enum';
import { SparePartRepository, SparePartRow } from '../src/modules/spare-parts/repositories/spare-part.repository';
import { SparePartsService } from '../src/modules/spare-parts/spare-parts.service';

function row(overrides: Partial<SparePartRow> = {}): SparePartRow {
  return {
    id: 'p1',
    sku: 'OLED-IP13',
    name: 'OLED',
    category: 'DISPLAY_OLED',
    unitCost: new Prisma.Decimal('650'),
    workshopPrice: new Prisma.Decimal('980'),
    physicalStock: 3,
    reservedStock: 1,
    availableStock: 2,
    minStock: 2,
    compatibilities: [{ deviceModelId: 'model-1' }],
    ...overrides,
  };
}

describe('SparePartsService', () => {
  let repository: jest.Mocked<SparePartRepository>;
  let service: SparePartsService;

  beforeEach(() => {
    repository = {
      findActive: jest.fn().mockResolvedValue(row()),
      findActiveMany: jest.fn().mockResolvedValue([row()]),
      runInTransaction: jest.fn((work) => work({} as Prisma.TransactionClient)),
      increase: jest.fn(),
      decrease: jest.fn(),
      recordMovement: jest.fn(),
    } as unknown as jest.Mocked<SparePartRepository>;
    service = new SparePartsService(repository);
  });

  it('shows unit cost to ADMIN only and hides prices from TECHNICIAN (RN-07) [007/RF-2.2]', async () => {
    expect(await service.get('p1', UserRole.ADMIN)).toMatchObject({ unitCost: '650.00', workshopPrice: '980.00' });
    const receptionist = await service.get('p1', UserRole.RECEPTIONIST);
    expect(receptionist).not.toHaveProperty('unitCost');
    expect(receptionist.workshopPrice).toBe('980.00');
    const technician = await service.get('p1', UserRole.TECHNICIAN);
    expect(technician).not.toHaveProperty('unitCost');
    expect(technician).not.toHaveProperty('workshopPrice');
  });

  it('flags low stock when available <= min stock (RN-11) [007/RF-6.1]', async () => {
    expect((await service.get('p1', UserRole.ADMIN)).lowStock).toBe(true);
  });

  it('prices compatible parts from the catalog (RN-10) [006/RF-2.1]', async () => {
    const prices = await service.priceCompatibleParts(['p1', 'p1'], 'model-1');
    expect(prices.get('p1')?.workshopPrice.toFixed(2)).toBe('980.00');
  });

  it('rejects a part that does not fit the device model (RN-10) [006/RF-2.1]', async () => {
    await expect(service.priceCompatibleParts(['p1'], 'model-2')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects unknown or inactive parts [006/RF-2.2]', async () => {
    repository.findActiveMany.mockResolvedValue([]);
    await expect(service.priceCompatibleParts(['p1'], 'model-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('blocks a write-off larger than the unreserved stock (RN-11) [007/RF-3.3]', async () => {
    repository.decrease.mockResolvedValue(false);
    await expect(service.adjust('p1', { delta: -5, reason: 'conteo físico' }, 'u1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.recordMovement).not.toHaveBeenCalled();
  });

  it('records a kardex row for each stock entry (BE-17) [007/RF-3.1] [007/RF-7.1]', async () => {
    await service.registerEntry('p1', { quantity: 4 }, 'u1');
    expect(repository.increase).toHaveBeenCalledWith(expect.anything(), 'p1', 4);
    expect(repository.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'IN', quantity: 4 }));
  });

  it('refuses to deactivate a part with reserved units [007/RF-1.5]', async () => {
    await expect(service.deactivate('p1')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
