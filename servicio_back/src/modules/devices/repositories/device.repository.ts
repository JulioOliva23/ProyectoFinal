import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const MODEL = { id: true, brand: true, model: true, isActive: true } as const;

@Injectable()
export class DeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // RN-13: full history, newest first.
  findHistoryByImei(imei: string) {
    return this.prisma.device.findUnique({
      where: { imei },
      select: {
        id: true,
        imei: true,
        color: true,
        deviceModel: { select: MODEL },
        customer: { select: { name: true } },
        workOrders: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            number: true,
            status: true,
            reportedProblem: true,
            preliminaryDiagnosis: true,
            createdAt: true,
            deliveredAt: true,
            technician: { select: { fullName: true } },
          },
        },
      },
    });
  }

  findActiveModel(id: string, transaction: Prisma.TransactionClient = this.prisma) {
    return transaction.deviceModel.findFirst({ where: { id, isActive: true }, select: MODEL });
  }

  findModelById(id: string) {
    return this.prisma.deviceModel.findUnique({ where: { id }, select: MODEL });
  }

  // The unique index is case-sensitive; "apple"/"Apple" must still collide.
  findModelByName(brand: string, model: string) {
    return this.prisma.deviceModel.findFirst({
      where: { brand: { equals: brand, mode: 'insensitive' }, model: { equals: model, mode: 'insensitive' } },
      select: MODEL,
    });
  }

  createModel(brand: string, model: string) {
    return this.prisma.deviceModel.create({ data: { brand, model }, select: MODEL });
  }

  updateModel(id: string, data: { brand?: string; model?: string; isActive?: boolean }) {
    return this.prisma.deviceModel.update({ where: { id }, data, select: MODEL });
  }

  listModels(includeInactive = false) {
    return this.prisma.deviceModel.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: MODEL,
      orderBy: [{ brand: 'asc' }, { model: 'asc' }],
    });
  }

  upsertCustomer(
    transaction: Prisma.TransactionClient,
    customer: { identification: string; name: string; phone?: string; email?: string },
  ) {
    return transaction.customer.upsert({
      where: { identification: customer.identification },
      create: customer,
      update: { name: customer.name, phone: customer.phone, email: customer.email },
      select: { id: true },
    });
  }

  findByImei(transaction: Prisma.TransactionClient, imei: string) {
    return transaction.device.findUnique({ where: { imei }, select: { id: true, customerId: true, deviceModelId: true } });
  }

  create(transaction: Prisma.TransactionClient, data: { imei: string; deviceModelId: string; customerId: string; color?: string }) {
    return transaction.device.create({ data, select: { id: true, customerId: true, deviceModelId: true } });
  }

  updateOwnership(transaction: Prisma.TransactionClient, id: string, data: { customerId: string; color?: string }) {
    return transaction.device.update({ where: { id }, data, select: { id: true, customerId: true, deviceModelId: true } });
  }
}
