import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UnlockCodeCipher } from '../src/common/crypto/unlock-code-cipher';
import { UserRole } from '../src/common/enums/user-role.enum';
import { WorkOrderStatus } from '../src/common/enums/work-order-status.enum';
import { Prisma } from '../src/generated/prisma/client';
import { DevicesService } from '../src/modules/devices/devices.service';
import { UsersService } from '../src/modules/users/users.service';
import { CreateWorkOrderDto } from '../src/modules/work-orders/dto/create-work-order.dto';
import { CosmeticCondition, LockType } from '../src/modules/work-orders/dto/work-order-enums';
import { WorkOrderDetailRow, WorkOrderRepository } from '../src/modules/work-orders/repositories/work-order.repository';
import { WorkOrdersService } from '../src/modules/work-orders/work-orders.service';

const cipher = new UnlockCodeCipher('b'.repeat(64));

function detail(overrides: Partial<WorkOrderDetailRow> = {}): WorkOrderDetailRow {
  return {
    id: 'wo-1',
    number: 1,
    status: WorkOrderStatus.RECEIVED,
    reportedProblem: 'No carga',
    preliminaryDiagnosis: null,
    batteryLevel: 10,
    cosmeticCheckIn: {},
    lockType: LockType.PIN,
    unlockCodeCipher: cipher.encrypt('4821'),
    promisedAt: null,
    deliveredAt: null,
    createdAt: new Date(),
    technicianId: 'tech-1',
    customerId: 'cust-1',
    device: { id: 'd1', imei: '352099001761481', color: null, deviceModel: { brand: 'Apple', model: 'iPhone 13' } },
    customer: { id: 'cust-1', name: 'Ana' },
    technician: { id: 'tech-1', fullName: 'Técnico Uno' },
    ...overrides,
  };
}

describe('WorkOrdersService', () => {
  const tx = {} as Prisma.TransactionClient;
  let repository: jest.Mocked<WorkOrderRepository>;
  let devices: jest.Mocked<Pick<DevicesService, 'checkIn'>>;
  let service: WorkOrdersService;

  beforeEach(() => {
    repository = {
      runInTransaction: jest.fn((work) => work(tx)),
      create: jest.fn().mockImplementation(async (_tx, data) => detail({ unlockCodeCipher: data.unlockCodeCipher })),
      findDetail: jest.fn().mockResolvedValue(detail()),
      list: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      revealUnlockCipher: jest.fn(),
      listAudit: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<WorkOrderRepository>;
    devices = { checkIn: jest.fn().mockResolvedValue({ deviceId: 'd1', customerId: 'cust-1', deviceModelId: 'm1' }) };
    service = new WorkOrdersService(repository, devices as unknown as DevicesService, {} as UsersService, cipher);
  });

  const intake: CreateWorkOrderDto = {
    customer: { identification: '123', name: 'Ana' },
    device: { imei: '352099001761481', deviceModelId: 'm1' },
    reportedProblem: 'No carga',
    cosmeticCheckIn: {
      screen: CosmeticCondition.OK,
      backCover: CosmeticCondition.OK,
      frame: CosmeticCondition.OK,
      cameraLens: CosmeticCondition.OK,
      buttons: CosmeticCondition.OK,
    },
    lockType: LockType.PIN,
    unlockCode: '4821',
  };

  it('encrypts the unlock code before persisting it and never returns it (RN-03)', async () => {
    const result = await service.create(intake, { id: 'recep-1', role: UserRole.RECEPTIONIST });
    const persisted = repository.create.mock.calls[0][1];
    expect(persisted.unlockCodeCipher).not.toContain('4821');
    expect(cipher.decrypt(persisted.unlockCodeCipher as string)).toBe('4821');
    expect(JSON.stringify(result)).not.toContain('4821');
    expect(result.hasUnlockCode).toBe(true);
    expect(result).not.toHaveProperty('unlockCodeCipher');
    expect(persisted.receptionistId).toBe('recep-1');
  });

  it('rejects a promised date in the past', async () => {
    await expect(
      service.create({ ...intake, promisedAt: '2000-01-01T00:00:00Z' }, { id: 'recep-1', role: UserRole.RECEPTIONIST }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('forces technicians to their own queue (RN-06)', async () => {
    await service.list({ page: 1, pageSize: 20, technicianId: 'someone-else' }, { id: 'tech-1', role: UserRole.TECHNICIAN });
    expect(repository.list).toHaveBeenCalledWith({ status: undefined, technicianId: 'tech-1' }, 1, 20);
  });

  it('forbids a technician from reading another technician order (RN-06)', async () => {
    await expect(service.get('wo-1', { id: 'tech-2', role: UserRole.TECHNICIAN })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 404 to a customer probing a foreign order (RN-14)', async () => {
    await expect(service.get('wo-1', { id: 'c', role: UserRole.CUSTOMER, customerId: 'cust-2' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reveals the code to the assigned technician through the audited path (RN-03)', async () => {
    repository.revealUnlockCipher.mockResolvedValue({ lockType: 'PIN', unlockCodeCipher: cipher.encrypt('4821') });
    await expect(service.revealUnlockCode('wo-1', { id: 'tech-1', role: UserRole.TECHNICIAN })).resolves.toEqual({ lockType: 'PIN', unlockCode: '4821' });
    expect(repository.revealUnlockCipher).toHaveBeenCalledWith('wo-1', 'tech-1');
  });

  it('does not reveal the code to receptionists', async () => {
    await expect(service.revealUnlockCode('wo-1', { id: 'r', role: UserRole.RECEPTIONIST })).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.revealUnlockCipher).not.toHaveBeenCalled();
  });
});
