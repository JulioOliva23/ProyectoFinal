// Real hashing, but `verify` is recorded so the timing-equalizer can be asserted.
jest.mock('argon2', () => {
  const actual = jest.requireActual('argon2');
  return { ...actual, verify: jest.fn(actual.verify) };
});

import * as argon2 from 'argon2';
import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UnlockCodeCipher } from '../src/common/crypto/unlock-code-cipher';
import { UserRole } from '../src/common/enums/user-role.enum';
import { WorkOrderStatus } from '../src/common/enums/work-order-status.enum';
import { Prisma } from '../src/generated/prisma/client';
import { BudgetsService } from '../src/modules/budgets/budgets.service';
import { BudgetRepository, BudgetRow } from '../src/modules/budgets/repositories/budget.repository';
import { AppConfigService } from '../src/modules/config/app-config.service';
import { DevicesService } from '../src/modules/devices/devices.service';
import { SparePartRepository } from '../src/modules/spare-parts/repositories/spare-part.repository';
import { SparePartsService } from '../src/modules/spare-parts/spare-parts.service';
import { UserRepository } from '../src/modules/users/repositories/user.repository';
import { UsersService } from '../src/modules/users/users.service';
import { CreateWorkOrderDto } from '../src/modules/work-orders/dto/create-work-order.dto';
import { CosmeticCondition, LockType } from '../src/modules/work-orders/dto/work-order-enums';
import { WorkOrderDetailRow, WorkOrderRepository } from '../src/modules/work-orders/repositories/work-order.repository';
import { WorkOrderTransitionService } from '../src/modules/work-orders/services/work-order-transition.service';
import { WorkOrdersService } from '../src/modules/work-orders/work-orders.service';

// Service rules promised by the specs that had no test. Tags: [spec/requirement].
const cipher = new UnlockCodeCipher('c'.repeat(64));
const admin = { id: 'admin-1', role: UserRole.ADMIN };
const tech = { id: 'tech-1', role: UserRole.TECHNICIAN };
const D = (value: string) => new Prisma.Decimal(value);

function detail(overrides: Partial<WorkOrderDetailRow> = {}): WorkOrderDetailRow {
  return {
    id: 'wo-1',
    number: 1,
    status: WorkOrderStatus.IN_DIAGNOSIS,
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

describe('Work order rules from the specs', () => {
  const tx = {} as Prisma.TransactionClient;
  let repository: jest.Mocked<WorkOrderRepository>;
  let devices: { checkIn: jest.Mock };
  let users: { assertActiveTechnician: jest.Mock };
  let service: WorkOrdersService;

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
    lockType: LockType.NONE,
  };

  beforeEach(() => {
    repository = {
      runInTransaction: jest.fn((work) => work(tx)),
      create: jest.fn().mockResolvedValue(detail()),
      findDetail: jest.fn().mockResolvedValue(detail()),
      list: jest.fn().mockResolvedValue({ rows: [detail()], total: 1 }),
      assignTechnician: jest.fn(),
      updateDiagnosis: jest.fn().mockImplementation(async (_id, text) => detail({ preliminaryDiagnosis: text })),
      findForCustomer: jest.fn(),
      findForPublicTracking: jest.fn(),
    } as unknown as jest.Mocked<WorkOrderRepository>;
    devices = { checkIn: jest.fn().mockResolvedValue({ deviceId: 'd1', customerId: 'cust-1', deviceModelId: 'm1' }) };
    users = { assertActiveTechnician: jest.fn().mockResolvedValue(undefined) };
    service = new WorkOrdersService(repository, devices as unknown as DevicesService, users as unknown as UsersService, cipher);
  });

  it('registers customer, device and order inside one transaction and lets a failure propagate [003/RF-2.2]', async () => {
    const failure = new Error('database down');
    repository.create.mockRejectedValue(failure);

    await expect(service.create(intake, { id: 'recep-1', role: UserRole.RECEPTIONIST })).rejects.toBe(failure);

    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(devices.checkIn).toHaveBeenCalledWith(tx, intake.device, intake.customer);
    expect(repository.create).toHaveBeenCalledWith(tx, expect.objectContaining({ receptionistId: 'recep-1' }));
  });

  it('allows reassigning only before the repair starts [004/RF-2.2]', async () => {
    repository.assignTechnician.mockResolvedValue(true);

    await service.assignTechnician('wo-1', { technicianId: 'tech-2' }, admin);

    const allowed = repository.assignTechnician.mock.calls[0][2];
    expect(allowed).toEqual([WorkOrderStatus.RECEIVED, WorkOrderStatus.IN_DIAGNOSIS, WorkOrderStatus.BUDGETED, WorkOrderStatus.APPROVED]);
    expect(allowed).not.toContain(WorkOrderStatus.IN_REPAIR);
  });

  it('rejects reassigning once the repair started with a conflict [004/RF-2.3]', async () => {
    repository.assignTechnician.mockResolvedValue(false);

    await expect(service.assignTechnician('wo-1', { technicianId: 'tech-2' }, admin)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a person who is not an active technician as assignee [004/RF-2.4]', async () => {
    users.assertActiveTechnician.mockRejectedValue(new UnprocessableEntityException('no es técnico'));

    await expect(service.assignTechnician('wo-1', { technicianId: 'x' }, admin)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.assignTechnician).not.toHaveBeenCalled();
  });

  it('saves the diagnosis only while the order is IN_DIAGNOSIS [004/RF-5]', async () => {
    const saved = await service.updateDiagnosis('wo-1', { preliminaryDiagnosis: 'Flex de carga oxidado' }, tech);
    expect(saved.preliminaryDiagnosis).toBe('Flex de carga oxidado');

    repository.findDetail.mockResolvedValue(detail({ status: WorkOrderStatus.APPROVED }));
    await expect(service.updateDiagnosis('wo-1', { preliminaryDiagnosis: 'Otro texto' }, tech)).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps another technician away from the diagnosis [004/RF-3.2]', async () => {
    await expect(service.updateDiagnosis('wo-1', { preliminaryDiagnosis: 'Ajeno' }, { id: 'tech-9', role: UserRole.TECHNICIAN })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('answers "not found" when the device has no unlock code [004/RF-9.3]', async () => {
    repository.findDetail.mockResolvedValue(detail({ unlockCodeCipher: null }));

    await expect(service.revealUnlockCode('wo-1', admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the page with data, total, page and size [005/RF-1.1]', async () => {
    const page = await service.list({ page: 2, pageSize: 20 }, admin);

    expect(page).toMatchObject({ total: 1, page: 2, pageSize: 20 });
    expect(page.data).toHaveLength(1);
  });

  it('never carries the unlock code nor its cipher in the order detail [005/RF-5.1]', async () => {
    for (const viewer of [admin, tech, { id: 'recep-1', role: UserRole.RECEPTIONIST }]) {
      const view = JSON.stringify(await service.get('wo-1', viewer));
      expect(view).not.toContain('unlockCodeCipher');
      expect(view).not.toContain('4821');
    }
  });

  it('answers "not found" for an unknown order [005/RF-5.2]', async () => {
    repository.findDetail.mockResolvedValue(null);

    await expect(service.get('missing', admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still verifies a hash when the order number does not exist, so timing does not reveal it [008/RF-3.2]', async () => {
    repository.findForPublicTracking.mockResolvedValue(null);
    const verify = argon2.verify as jest.Mock;
    verify.mockClear();

    await expect(service.trackPublicly({ number: 999_999, trackingCode: 'K7QM3XPA' })).rejects.toBeInstanceOf(NotFoundException);

    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('shows the customer exactly the fields of the spec, even if the row carries more [008/RF-5.2]', async () => {
    repository.findForCustomer.mockResolvedValue([
      {
        id: 'wo-1',
        number: 7,
        status: WorkOrderStatus.IN_REPAIR,
        device: { deviceModel: { brand: 'Apple', model: 'iPhone 13' } },
        promisedAt: null,
        budgets: [{ total: D('1130') }],
        updatedAt: new Date(),
        trackingCodeHash: '$argon2id$secret',
        unlockCodeCipher: 'cipher',
      } as never,
    ]);

    const [view] = await service.listForCustomer({ id: 'u1', role: UserRole.CUSTOMER, customerId: 'cust-1' });

    expect(Object.keys(view).sort()).toEqual(['budgetTotal', 'device', 'id', 'number', 'promisedAt', 'status', 'statusLabel', 'updatedAt']);
  });

  it('refuses a customer account that is not linked to a customer [008/RF-7.2]', async () => {
    await expect(service.listForCustomer({ id: 'u1', role: UserRole.CUSTOMER })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('User rules from the specs', () => {
  let repository: jest.Mocked<UserRepository>;
  let service: UsersService;

  beforeEach(() => {
    repository = {
      findByUsername: jest.fn().mockResolvedValue(null),
      customerExists: jest.fn().mockResolvedValue(false),
      create: jest.fn(),
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<UserRepository>;
    service = new UsersService(repository);
  });

  it('requires the linked customer of a Cliente account to exist [002/RF-1.5]', async () => {
    const account = { username: 'cliente09', password: 'Str0ngPassword', fullName: 'Cliente Nueve', role: UserRole.CUSTOMER, customerId: 'missing' };

    await expect(service.create(account)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('passes the role filter to the listing [002/RF-2.1]', async () => {
    await service.list({ role: UserRole.TECHNICIAN }, { id: 'recep-1', role: UserRole.RECEPTIONIST });

    expect(repository.list).toHaveBeenCalledWith({ role: UserRole.TECHNICIAN, includeInactive: false });
  });
});

describe('Budget rules from the specs', () => {
  const tx = {} as Prisma.TransactionClient;
  const recep = { id: 'recep-1', role: UserRole.RECEPTIONIST };
  let repository: jest.Mocked<BudgetRepository>;
  let service: BudgetsService;

  const stored = (): BudgetRow =>
    ({ id: 'b2', workOrderId: 'wo-1', version: 2, status: 'DRAFT', laborSubtotal: D('1'), partsSubtotal: D('0'), total: D('1'), currency: 'BOB', expiresAt: new Date(), sentAt: null, decidedAt: null, decisionChannel: null, rejectionReason: null, items: [] }) as BudgetRow;

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(stored()),
      findWorkOrderContext: jest.fn().mockResolvedValue({ id: 'wo-1', status: WorkOrderStatus.BUDGETED, device: { deviceModelId: 'm1' } }),
      runInTransaction: jest.fn((work) => work(tx)),
      changeStatus: jest.fn().mockResolvedValue(true),
      supersedeOthers: jest.fn(),
    } as unknown as jest.Mocked<BudgetRepository>;
    const transitions = { transitionWithin: jest.fn() } as unknown as WorkOrderTransitionService;
    service = new BudgetsService(repository, {} as SparePartsService, transitions, { getBudgetValidityDays: () => 7 } as AppConfigService);
  });

  it('replaces the earlier versions when a new one is sent, without deleting them [006/RF-3.1]', async () => {
    await service.send('b2', recep);

    expect(repository.supersedeOthers).toHaveBeenCalledWith(tx, 'wo-1', 'b2');
  });

  it('refuses to send a budget that is not a draft [006/RF-4.3]', async () => {
    repository.changeStatus.mockResolvedValue(false);

    await expect(service.send('b2', recep)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.supersedeOthers).not.toHaveBeenCalled();
  });
});

describe('Spare part rules from the specs', () => {
  let repository: jest.Mocked<SparePartRepository>;
  let service: SparePartsService;

  beforeEach(() => {
    repository = { countExistingModels: jest.fn().mockResolvedValue(0), create: jest.fn() } as unknown as jest.Mocked<SparePartRepository>;
    service = new SparePartsService(repository);
  });

  it('rejects compatible device models that do not exist [007/RF-1.6]', async () => {
    const part = { sku: 'OLED-IP13', name: 'Pantalla', category: 'DISPLAY_OLED', unitCost: '1.00', workshopPrice: '2.00', minStock: 1, compatibleDeviceModelIds: ['ghost'] };

    await expect(service.create(part as never)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
