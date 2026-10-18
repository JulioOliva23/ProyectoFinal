import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
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
});
