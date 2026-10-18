import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { Prisma } from '../../generated/prisma/client';
import { SparePartCategory, StockMovementType } from './dto/spare-part-category.enum';
import { CreateSparePartDto, QuerySparePartsDto, StockAdjustmentDto, StockEntryDto, UpdateSparePartDto } from './dto/spare-part.dto';
import { SparePartResponseDto } from './dto/spare-part.response.dto';
import { SparePartRepository, SparePartRow } from './repositories/spare-part.repository';

export interface PricedPart {
  id: string;
  name: string;
  workshopPrice: Prisma.Decimal;
}

@Injectable()
export class SparePartsService {
  constructor(private readonly repository: SparePartRepository) {}

  async list(query: QuerySparePartsDto, role: UserRole): Promise<Paginated<SparePartResponseDto>> {
    const { rows, total } = await this.repository.list(query, query.page, query.pageSize);
    return { data: rows.map((row) => toResponse(row, role)), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, role: UserRole): Promise<SparePartResponseDto> {
    return toResponse(await this.requireActive(id), role);
  }

  async lowStockAlerts(role: UserRole): Promise<SparePartResponseDto[]> {
    return (await this.repository.findBelowMinStock()).map((row) => toResponse(row, role));
  }

  async create(dto: CreateSparePartDto): Promise<SparePartResponseDto> {
    const { compatibleDeviceModelIds = [], ...data } = dto;
    await this.assertModelsExist(compatibleDeviceModelIds);
    return toResponse(await this.repository.create(data, compatibleDeviceModelIds), UserRole.ADMIN);
  }

  async update(id: string, dto: UpdateSparePartDto): Promise<SparePartResponseDto> {
    await this.requireActive(id);
    if (dto.compatibleDeviceModelIds) await this.assertModelsExist(dto.compatibleDeviceModelIds);
    const { compatibleDeviceModelIds, ...data } = dto;
    return toResponse(await this.repository.update(id, data, compatibleDeviceModelIds), UserRole.ADMIN);
  }

  async deactivate(id: string): Promise<SparePartResponseDto> {
    const part = await this.requireActive(id);
    if (part.reservedStock > 0) {
      throw new UnprocessableEntityException('Cannot deactivate a part with units reserved for work orders');
    }
    return toResponse(await this.repository.deactivate(id), UserRole.ADMIN);
  }

  // BE-16: stock change + kardex row in one transaction.
  async registerEntry(id: string, dto: StockEntryDto, userId: string): Promise<SparePartResponseDto> {
    await this.requireActive(id);
    const updated = await this.repository.runInTransaction(async (transaction) => {
      await this.repository.increase(transaction, id, dto.quantity);
      await this.repository.recordMovement(transaction, { sparePartId: id, userId, type: StockMovementType.IN, quantity: dto.quantity, reason: dto.reason });
      return this.repository.findActive(id, transaction);
    });
    return toResponse(updated as SparePartRow, UserRole.ADMIN);
  }

  async adjust(id: string, dto: StockAdjustmentDto, userId: string): Promise<SparePartResponseDto> {
    await this.requireActive(id);
    const updated = await this.repository.runInTransaction(async (transaction) => {
      if (dto.delta > 0) {
        await this.repository.increase(transaction, id, dto.delta);
      } else if (!(await this.repository.decrease(transaction, id, -dto.delta))) {
        // RN-11: reserved units belong to work orders and cannot be written off.
        throw new UnprocessableEntityException('RN-11: adjustment exceeds the available (unreserved) stock');
      }
      await this.repository.recordMovement(transaction, {
        sparePartId: id,
        userId,
        type: StockMovementType.ADJUSTMENT,
        quantity: dto.delta,
        reason: dto.reason,
      });
      return this.repository.findActive(id, transaction);
    });
    return toResponse(updated as SparePartRow, UserRole.ADMIN);
  }

  // RN-10: used by budgets. Returns catalog prices (never client-supplied)
  // and rejects inactive or incompatible parts.
  async priceCompatibleParts(partIds: string[], deviceModelId: string): Promise<Map<string, PricedPart>> {
    const unique = [...new Set(partIds)];
    const parts = await this.repository.findActiveMany(unique);
    if (parts.length !== unique.length) throw new UnprocessableEntityException('Spare part not found or inactive');
    const incompatible = parts.filter((part) => !part.compatibilities.some((c) => c.deviceModelId === deviceModelId));
    if (incompatible.length > 0) {
      throw new UnprocessableEntityException({
        message: 'RN-10: spare part is not compatible with this device model',
        sparePartIds: incompatible.map((part) => part.id),
      });
    }
    return new Map(parts.map((part) => [part.id, { id: part.id, name: part.name, workshopPrice: part.workshopPrice }]));
  }

  private async requireActive(id: string): Promise<SparePartRow> {
    const part = await this.repository.findActive(id);
    if (!part) throw new NotFoundException('Spare part not found');
    return part;
  }

  private async assertModelsExist(ids: string[]): Promise<void> {
    if (ids.length > 0 && (await this.repository.countExistingModels(ids)) !== ids.length) {
      throw new UnprocessableEntityException('One or more device models do not exist');
    }
  }
}

function toResponse(row: SparePartRow, role: UserRole): SparePartResponseDto {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category as SparePartCategory,
    // RN-07
    ...(role === UserRole.ADMIN ? { unitCost: row.unitCost.toFixed(2) } : {}),
    ...(role !== UserRole.TECHNICIAN ? { workshopPrice: row.workshopPrice.toFixed(2) } : {}),
    physicalStock: row.physicalStock,
    reservedStock: row.reservedStock,
    availableStock: row.availableStock,
    minStock: row.minStock,
    lowStock: row.availableStock <= row.minStock,
    compatibleDeviceModelIds: row.compatibilities.map((c) => c.deviceModelId),
  };
}
