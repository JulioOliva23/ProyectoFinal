import * as argon2 from 'argon2';
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
    device: { id: 'd1', imei: '352099001761481', color: null, deviceModel: { id: 'm1', brand: 'Apple', model: 'iPhone 13' } },
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
      findForPublicTracking: jest.fn(),
      setTrackingCodeHash: jest.fn(),
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

  it('encrypts the unlock code before persisting it and never returns it (RN-03) [003/RF-4.2]', async () => {
    const result = await service.create(intake, { id: 'recep-1', role: UserRole.RECEPTIONIST });
    const persisted = repository.create.mock.calls[0][1];
    expect(persisted.unlockCodeCipher).not.toContain('4821');
    expect(cipher.decrypt(persisted.unlockCodeCipher as string)).toBe('4821');
    expect(JSON.stringify(result)).not.toContain('4821');
    expect(result.hasUnlockCode).toBe(true);
    expect(result).not.toHaveProperty('unlockCodeCipher');
    expect(persisted.receptionistId).toBe('recep-1');
  });

  it('returns the tracking code once and stores only its argon2 hash (SUP-05) [008/RF-1.2]', async () => {
    const result = await service.create(intake, { id: 'recep-1', role: UserRole.RECEPTIONIST });
    const persisted = repository.create.mock.calls[0][1];
    expect(result.trackingCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(persisted.trackingCodeHash).toMatch(/^\$argon2/);
    expect(await argon2.verify(persisted.trackingCodeHash as string, result.trackingCode.replace('-', ''))).toBe(true);
    expect(result.trackingCode.replace('-', '')).not.toBe(intake.unlockCode);
  });

  describe('public tracking (SUP-05)', () => {
    const statusRow = {
      id: 'wo-1',
      number: 123,
      status: WorkOrderStatus.IN_REPAIR,
      promisedAt: null,
      updatedAt: new Date('2026-10-19T12:00:00Z'),
      device: { deviceModel: { brand: 'Apple', model: 'iPhone 13' } },
      budgets: [{ total: new Prisma.Decimal('1130') }],
    };

    it('returns only the customer status view for a valid code (RN-14) [008/RF-2.1]', async () => {
      repository.findForPublicTracking.mockResolvedValue({ ...statusRow, trackingCodeHash: await argon2.hash('K7QM3XPA') });
      const result = await service.trackPublicly({ number: 123, trackingCode: 'K7QM3XPA' });
      expect(result).toEqual({
        id: 'wo-1',
        number: 123,
        status: WorkOrderStatus.IN_REPAIR,
        statusLabel: 'En Reparación',
        device: 'Apple iPhone 13',
        promisedAt: null,
        budgetTotal: '1130.00',
        updatedAt: statusRow.updatedAt,
      });
      expect(result).not.toHaveProperty('trackingCodeHash');
    });

    it('answers the same 404 for a wrong code and for an unknown number [008/RF-3.1]', async () => {
      repository.findForPublicTracking.mockResolvedValue({ ...statusRow, trackingCodeHash: await argon2.hash('K7QM3XPA') });
      const wrong = await service.trackPublicly({ number: 123, trackingCode: 'ZZZZZZZZ' }).catch((error: unknown) => error);
      repository.findForPublicTracking.mockResolvedValue(null);
      const unknown = await service.trackPublicly({ number: 999, trackingCode: 'K7QM3XPA' }).catch((error: unknown) => error);
      expect(wrong).toBeInstanceOf(NotFoundException);
      expect(unknown).toBeInstanceOf(NotFoundException);
      expect((wrong as NotFoundException).message).toBe((unknown as NotFoundException).message);
    });

    it('rejects orders created before SUP-05 (no hash) [008/RF-3.3]', async () => {
      repository.findForPublicTracking.mockResolvedValue({ ...statusRow, trackingCodeHash: null });
      await expect(service.trackPublicly({ number: 123, trackingCode: 'K7QM3XPA' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('regenerates the code, never matching the unlock code, and replaces the hash [008/RF-6.1] [008/RF-6.2]', async () => {
      const result = await service.regenerateTrackingCode('wo-1');
      const [id, hash] = repository.setTrackingCodeHash.mock.calls[0];
      expect(id).toBe('wo-1');
      expect(await argon2.verify(hash, result.trackingCode.replace('-', ''))).toBe(true);
      expect(result.trackingCode.replace('-', '')).not.toBe('4821');
    });
  });

  it('rejects a promised date in the past [003/RF-3.4]', async () => {
    await expect(
      service.create({ ...intake, promisedAt: '2000-01-01T00:00:00Z' }, { id: 'recep-1', role: UserRole.RECEPTIONIST }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('forces technicians to their own queue (RN-06) [005/RF-3.1] [004/RF-3.1]', async () => {
    await service.list({ page: 1, pageSize: 20, technicianId: 'someone-else' }, { id: 'tech-1', role: UserRole.TECHNICIAN });
    expect(repository.list).toHaveBeenCalledWith({ status: undefined, technicianId: 'tech-1', search: undefined }, 1, 20);
  });

  it('keeps the technician scope when searching (RN-06) [005/RF-3.1]', async () => {
    await service.list({ page: 1, pageSize: 20, search: 'OT-000007' }, { id: 'tech-1', role: UserRole.TECHNICIAN });
    expect(repository.list).toHaveBeenCalledWith({ status: undefined, technicianId: 'tech-1', search: { text: 'OT-000007', number: 7 } }, 1, 20);
  });

  it('passes the front desk filters through [005/RF-1.2] [005/RF-1.3]', async () => {
    await service.list(
      { page: 2, pageSize: 10, status: WorkOrderStatus.IN_REPAIR, technicianId: 'tech-9', search: 'Quispe' },
      { id: 'recep-1', role: UserRole.RECEPTIONIST },
    );
    expect(repository.list).toHaveBeenCalledWith({ status: WorkOrderStatus.IN_REPAIR, technicianId: 'tech-9', search: { text: 'Quispe' } }, 2, 10);
  });

  describe('summary', () => {
    beforeEach(() => {
      repository.countByStatus = jest.fn().mockResolvedValue([
        { status: WorkOrderStatus.RECEIVED, count: 3 },
        { status: WorkOrderStatus.BUDGETED, count: 2 },
        { status: WorkOrderStatus.READY_FOR_DELIVERY, count: 1 },
        { status: WorkOrderStatus.DELIVERED, count: 40 },
        { status: WorkOrderStatus.CANCELLED, count: 5 },
      ]);
      repository.countOverdue = jest.fn().mockResolvedValue(2);
    });

    it('counts active orders without the terminal states [005/RF-4.1]', async () => {
      const summary = await service.summary();
      expect(summary.active).toBe(6);
      expect(summary.overdue).toBe(2);
    });

    it('lists every status, zeros included [005/RF-4.3]', async () => {
      const { byStatus } = await service.summary();
      expect(byStatus.map((entry) => entry.status)).toEqual(Object.values(WorkOrderStatus));
      expect(byStatus.find((entry) => entry.status === WorkOrderStatus.IN_REPAIR)?.count).toBe(0);
      expect(byStatus.find((entry) => entry.status === WorkOrderStatus.BUDGETED)?.count).toBe(2);
    });

    it('asks for overdue orders among the statuses the shop still works on [005/RF-4.2]', async () => {
      const now = new Date('2026-10-29T12:00:00Z');
      await service.summary(now);
      const [statuses, at] = (repository.countOverdue as jest.Mock).mock.calls[0];
      expect(statuses).not.toContain(WorkOrderStatus.READY_FOR_DELIVERY);
      expect(statuses).not.toContain(WorkOrderStatus.DELIVERED);
      expect(at).toBe(now);
    });
  });

  it('returns only the transitions the viewer may trigger (FE-08) [004/RF-1.7]', async () => {
    repository.findDetail.mockResolvedValue(detail({ status: WorkOrderStatus.APPROVED }));
    expect((await service.get('wo-1', { id: 'tech-1', role: UserRole.TECHNICIAN })).allowedTransitions).toEqual([WorkOrderStatus.IN_REPAIR]);
    expect((await service.get('wo-1', { id: 'recep-1', role: UserRole.RECEPTIONIST })).allowedTransitions).toEqual([]);
  });

  it('forbids a technician from reading another technician order (RN-06) [004/RF-3.2]', async () => {
    await expect(service.get('wo-1', { id: 'tech-2', role: UserRole.TECHNICIAN })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 404 to a customer probing a foreign order (RN-14) [008/RF-7.3]', async () => {
    await expect(service.get('wo-1', { id: 'c', role: UserRole.CUSTOMER, customerId: 'cust-2' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reveals the code to the assigned technician through the audited path (RN-03) [004/RF-9.1]', async () => {
    repository.revealUnlockCipher.mockResolvedValue({ lockType: 'PIN', unlockCodeCipher: cipher.encrypt('4821') });
    await expect(service.revealUnlockCode('wo-1', { id: 'tech-1', role: UserRole.TECHNICIAN })).resolves.toEqual({ lockType: 'PIN', unlockCode: '4821' });
    expect(repository.revealUnlockCipher).toHaveBeenCalledWith('wo-1', 'tech-1');
  });

  it('does not reveal the code to receptionists [004/RF-9.2]', async () => {
    await expect(service.revealUnlockCode('wo-1', { id: 'r', role: UserRole.RECEPTIONIST })).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.revealUnlockCipher).not.toHaveBeenCalled();
  });
});
