import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';
import { CustomerCheckInDto, DeviceCheckInDto } from './dto/device-check-in.dto';
import { DeviceHistoryResponseDto } from './dto/device-history.response.dto';
import { DeviceModelResponseDto } from './dto/device-model.dto';
import { DeviceRepository } from './repositories/device.repository';

export interface CheckedInDevice {
  deviceId: string;
  customerId: string;
  deviceModelId: string;
}

@Injectable()
export class DevicesService {
  constructor(private readonly repository: DeviceRepository) {}

  async getHistoryByImei(imei: string): Promise<DeviceHistoryResponseDto> {
    const device = await this.repository.findHistoryByImei(imei);
    if (!device) throw new NotFoundException('Device not registered');
    return {
      id: device.id,
      imei: device.imei,
      color: device.color,
      deviceModel: device.deviceModel,
      customerName: device.customer.name,
      repairs: device.workOrders.map((order) => ({
        workOrderId: order.id,
        number: order.number,
        status: order.status as WorkOrderStatus,
        reportedProblem: order.reportedProblem,
        preliminaryDiagnosis: order.preliminaryDiagnosis,
        technicianName: order.technician?.fullName ?? null,
        createdAt: order.createdAt,
        deliveredAt: order.deliveredAt,
      })),
    };
  }

  createModel(brand: string, model: string): Promise<DeviceModelResponseDto> {
    return this.repository.createModel(brand, model);
  }

  listModels(): Promise<DeviceModelResponseDto[]> {
    return this.repository.listModels();
  }

  // RN-01 / RN-13: reuse the device registered under this IMEI (keeping its
  // history) or create it. A device may change owner (resale); its model
  // never changes because the IMEI is bound to the hardware.
  async checkIn(
    transaction: Prisma.TransactionClient,
    device: DeviceCheckInDto,
    customer: CustomerCheckInDto,
  ): Promise<CheckedInDevice> {
    if (!(await this.repository.findActiveModel(device.deviceModelId, transaction))) {
      throw new UnprocessableEntityException('Device model not found or inactive');
    }
    const owner = await this.repository.upsertCustomer(transaction, customer);
    const existing = await this.repository.findByImei(transaction, device.imei);
    if (existing && existing.deviceModelId !== device.deviceModelId) {
      throw new ConflictException('RN-02: this IMEI is already registered for a different device model');
    }
    const saved = existing
      ? await this.repository.updateOwnership(transaction, existing.id, { customerId: owner.id, color: device.color })
      : await this.repository.create(transaction, { ...device, customerId: owner.id });
    return { deviceId: saved.id, customerId: saved.customerId, deviceModelId: saved.deviceModelId };
  }
}
