import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';
import { CustomerCheckInDto, DeviceCheckInDto } from './dto/device-check-in.dto';
import { DeviceHistoryResponseDto } from './dto/device-history.response.dto';
import { DeviceModelResponseDto, UpdateDeviceModelDto } from './dto/device-model.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
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
    if (!device) throw new NotFoundException('El equipo no está registrado');
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

  async createModel(brand: string, model: string): Promise<DeviceModelResponseDto> {
    await this.assertModelNameFree(brand, model);
    return this.repository.createModel(brand, model);
  }

  // US-21: rename or (de)activate. An inactive model is hidden from intake
  // (checkIn rejects it) but its devices, history and compatibilities stay.
  async updateModel(id: string, dto: UpdateDeviceModelDto): Promise<DeviceModelResponseDto> {
    const current = await this.repository.findModelById(id);
    if (!current) throw new NotFoundException('El modelo de equipo no existe');
    const brand = dto.brand ?? current.brand;
    const model = dto.model ?? current.model;
    if (brand !== current.brand || model !== current.model) await this.assertModelNameFree(brand, model, id);
    return this.repository.updateModel(id, { brand: dto.brand, model: dto.model, isActive: dto.isActive });
  }

  // Inactive models are listed only for the admin catalog.
  listModels(viewer: AuthenticatedUser, includeInactive = false): Promise<DeviceModelResponseDto[]> {
    return this.repository.listModels(includeInactive && viewer.role === UserRole.ADMIN);
  }

  private async assertModelNameFree(brand: string, model: string, exceptId?: string): Promise<void> {
    const existing = await this.repository.findModelByName(brand, model);
    if (existing && existing.id !== exceptId) throw new ConflictException('Ese modelo ya está registrado para esa marca');
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
      throw new UnprocessableEntityException('El modelo de equipo no existe o está inactivo');
    }
    const owner = await this.repository.upsertCustomer(transaction, customer);
    const existing = await this.repository.findByImei(transaction, device.imei);
    if (existing && existing.deviceModelId !== device.deviceModelId) {
      throw new ConflictException('RN-02: este IMEI ya está registrado con otro modelo de equipo');
    }
    const saved = existing
      ? await this.repository.updateOwnership(transaction, existing.id, { customerId: owner.id, color: device.color })
      : await this.repository.create(transaction, { ...device, customerId: owner.id });
    return { deviceId: saved.id, customerId: saved.customerId, deviceModelId: saved.deviceModelId };
  }
}
