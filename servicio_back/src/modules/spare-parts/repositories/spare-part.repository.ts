import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { StockMovementType } from '../dto/spare-part-category.enum';

export const SPARE_PART_SELECT = {
  id: true,
  sku: true,
  name: true,
  category: true,
  unitCost: true,
  workshopPrice: true,
  physicalStock: true,
  reservedStock: true,
  availableStock: true,
  minStock: true,
  compatibilities: { select: { deviceModelId: true } },
} as const;

export type SparePartRow = Prisma.SparePartGetPayload<{ select: typeof SPARE_PART_SELECT }>;

export interface SparePartFilter {
  category?: string;
  deviceModelId?: string;
  search?: string;
}

@Injectable()
export class SparePartRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  async list(filter: SparePartFilter, page: number, pageSize: number): Promise<{ rows: SparePartRow[]; total: number }> {
    const where: Prisma.SparePartWhereInput = {
      isActive: true,
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.deviceModelId ? { compatibilities: { some: { deviceModelId: filter.deviceModelId } } } : {}),
      ...(filter.search
        ? { OR: [{ name: { contains: filter.search, mode: 'insensitive' } }, { sku: { contains: filter.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sparePart.findMany({ where, select: SPARE_PART_SELECT, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.sparePart.count({ where }),
    ]);
    return { rows, total };
  }

  // RN-11: column-to-column comparison through a field reference.
  findBelowMinStock(): Promise<SparePartRow[]> {
    return this.prisma.sparePart.findMany({
      where: { isActive: true, availableStock: { lte: this.prisma.sparePart.fields.minStock } },
      select: SPARE_PART_SELECT,
      orderBy: { availableStock: 'asc' },
    });
  }

  findActive(id: string, transaction: Prisma.TransactionClient = this.prisma): Promise<SparePartRow | null> {
    return transaction.sparePart.findFirst({ where: { id, isActive: true }, select: SPARE_PART_SELECT });
  }

  findActiveMany(ids: string[]): Promise<SparePartRow[]> {
    return this.prisma.sparePart.findMany({ where: { id: { in: ids }, isActive: true }, select: SPARE_PART_SELECT });
  }

  countExistingModels(ids: string[]): Promise<number> {
    return this.prisma.deviceModel.count({ where: { id: { in: ids }, isActive: true } });
  }

  create(data: Omit<Prisma.SparePartCreateInput, 'compatibilities'>, deviceModelIds: string[]): Promise<SparePartRow> {
    return this.prisma.sparePart.create({
      data: { ...data, compatibilities: { create: deviceModelIds.map((deviceModelId) => ({ deviceModelId })) } },
      select: SPARE_PART_SELECT,
    });
  }

  update(id: string, data: Prisma.SparePartUpdateInput, deviceModelIds?: string[]): Promise<SparePartRow> {
    return this.prisma.$transaction(async (transaction) => {
      if (deviceModelIds) {
        await transaction.sparePartCompatibility.deleteMany({ where: { sparePartId: id } });
        await transaction.sparePartCompatibility.createMany({ data: deviceModelIds.map((deviceModelId) => ({ sparePartId: id, deviceModelId })) });
      }
      return transaction.sparePart.update({ where: { id }, data, select: SPARE_PART_SELECT });
    });
  }

  deactivate(id: string): Promise<SparePartRow> {
    return this.prisma.sparePart.update({ where: { id }, data: { isActive: false }, select: SPARE_PART_SELECT });
  }

  // Positive delta: physical and available grow together.
  async increase(transaction: Prisma.TransactionClient, id: string, quantity: number): Promise<void> {
    await transaction.sparePart.update({
      where: { id },
      data: { physicalStock: { increment: quantity }, availableStock: { increment: quantity }, lastMovementAt: new Date() },
    });
  }

  // Negative delta: guarded so only unreserved units can be written off.
  async decrease(transaction: Prisma.TransactionClient, id: string, quantity: number): Promise<boolean> {
    const result = await transaction.sparePart.updateMany({
      where: { id, availableStock: { gte: quantity }, physicalStock: { gte: quantity } },
      data: { physicalStock: { decrement: quantity }, availableStock: { decrement: quantity }, lastMovementAt: new Date() },
    });
    return result.count === 1;
  }

  async recordMovement(
    transaction: Prisma.TransactionClient,
    movement: { sparePartId: string; userId: string; type: StockMovementType; quantity: number; reason?: string },
  ): Promise<void> {
    await transaction.stockMovement.create({ data: movement });
  }
}
