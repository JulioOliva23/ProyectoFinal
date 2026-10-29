import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UserRole } from '../src/common/enums/user-role.enum';
import { Prisma } from '../src/generated/prisma/client';
import { DevicesService } from '../src/modules/devices/devices.service';
import { DeviceRepository } from '../src/modules/devices/repositories/device.repository';

describe('DevicesService', () => {
  const tx = {} as Prisma.TransactionClient;
  const customer = { identification: '123', name: 'Ana' };
  const device = { imei: '352099001761481', deviceModelId: 'model-1', color: 'Blue' };
  let repository: jest.Mocked<DeviceRepository>;
  let service: DevicesService;

  beforeEach(() => {
    repository = {
      findActiveModel: jest.fn().mockResolvedValue({ id: 'model-1' }),
      upsertCustomer: jest.fn().mockResolvedValue({ id: 'cust-1' }),
      findByImei: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'dev-1', customerId: 'cust-1', deviceModelId: 'model-1' }),
      updateOwnership: jest.fn().mockResolvedValue({ id: 'dev-0', customerId: 'cust-1', deviceModelId: 'model-1' }),
      findHistoryByImei: jest.fn(),
      findModelById: jest.fn().mockResolvedValue({ id: 'model-1', brand: 'Apple', model: 'iPhone 13', isActive: true }),
      findModelByName: jest.fn().mockResolvedValue(null),
      createModel: jest.fn().mockImplementation(async (brand: string, model: string) => ({ id: 'model-2', brand, model, isActive: true })),
      updateModel: jest.fn().mockImplementation(async (id: string, data: object) => ({ id, brand: 'Apple', model: 'iPhone 13', isActive: true, ...data })),
      listModels: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DeviceRepository>;
    service = new DevicesService(repository);
  });

  it('registers a new device on first check-in', async () => {
    await expect(service.checkIn(tx, device, customer)).resolves.toEqual({ deviceId: 'dev-1', customerId: 'cust-1', deviceModelId: 'model-1' });
    expect(repository.create).toHaveBeenCalledWith(tx, { ...device, customerId: 'cust-1' });
  });

  it('reuses the device (and its history) when the IMEI is known (RN-13)', async () => {
    repository.findByImei.mockResolvedValue({ id: 'dev-0', customerId: 'old', deviceModelId: 'model-1' });
    await expect(service.checkIn(tx, device, customer)).resolves.toMatchObject({ deviceId: 'dev-0' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a known IMEI declared with another model (RN-02)', async () => {
    repository.findByImei.mockResolvedValue({ id: 'dev-0', customerId: 'old', deviceModelId: 'model-9' });
    await expect(service.checkIn(tx, device, customer)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an unknown or inactive device model', async () => {
    repository.findActiveModel.mockResolvedValue(null);
    await expect(service.checkIn(tx, device, customer)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('returns 404 for an unregistered IMEI lookup', async () => {
    repository.findHistoryByImei.mockResolvedValue(null);
    await expect(service.getHistoryByImei('352099001761481')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('device model catalog (US-21)', () => {
    it('creates a model when the brand + model pair is free', async () => {
      await expect(service.createModel('Samsung', 'Galaxy A54')).resolves.toMatchObject({ id: 'model-2', brand: 'Samsung' });
      expect(repository.findModelByName).toHaveBeenCalledWith('Samsung', 'Galaxy A54');
    });

    it('rejects a duplicate regardless of letter case', async () => {
      repository.findModelByName.mockResolvedValue({ id: 'model-1', brand: 'Apple', model: 'iPhone 13', isActive: true });
      await expect(service.createModel('apple', 'IPHONE 13')).rejects.toBeInstanceOf(ConflictException);
      expect(repository.createModel).not.toHaveBeenCalled();
    });

    it('renames a model unless the new name belongs to another one', async () => {
      await expect(service.updateModel('model-1', { model: 'iPhone 13 mini' })).resolves.toMatchObject({ model: 'iPhone 13 mini' });
      expect(repository.findModelByName).toHaveBeenCalledWith('Apple', 'iPhone 13 mini');

      repository.findModelByName.mockResolvedValue({ id: 'model-9', brand: 'Apple', model: 'iPhone 14', isActive: true });
      await expect(service.updateModel('model-1', { model: 'iPhone 14' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('accepts a case-only rename of the same model', async () => {
      repository.findModelByName.mockResolvedValue({ id: 'model-1', brand: 'Apple', model: 'iPhone 13', isActive: true });
      await expect(service.updateModel('model-1', { model: 'IPHONE 13' })).resolves.toMatchObject({ model: 'IPHONE 13' });
    });

    it('toggles activation without a name check', async () => {
      await expect(service.updateModel('model-1', { isActive: false })).resolves.toMatchObject({ isActive: false });
      expect(repository.findModelByName).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown model', async () => {
      repository.findModelById.mockResolvedValue(null);
      await expect(service.updateModel('nope', { isActive: false })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists inactive models only for ADMIN', async () => {
      await service.listModels({ id: 'a', role: UserRole.ADMIN }, true);
      expect(repository.listModels).toHaveBeenLastCalledWith(true);
      await service.listModels({ id: 'r', role: UserRole.RECEPTIONIST }, true);
      expect(repository.listModels).toHaveBeenLastCalledWith(false);
    });
  });
});
