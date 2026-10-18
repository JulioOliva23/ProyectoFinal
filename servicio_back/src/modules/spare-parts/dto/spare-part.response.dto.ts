import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SparePartCategory } from './spare-part-category.enum';

// RN-07: unitCost is visible to ADMIN only; workshopPrice is hidden from
// TECHNICIAN. Hidden fields are omitted, not nulled.
export class SparePartResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: SparePartCategory }) category!: SparePartCategory;
  @ApiPropertyOptional() unitCost?: string;
  @ApiPropertyOptional() workshopPrice?: string;
  @ApiProperty() physicalStock!: number;
  @ApiProperty() reservedStock!: number;
  @ApiProperty() availableStock!: number;
  @ApiProperty() minStock!: number;
  @ApiProperty() lowStock!: boolean;
  @ApiProperty({ type: [String] }) compatibleDeviceModelIds!: string[];
}

export class PaginatedSparePartsDto {
  @ApiProperty({ type: [SparePartResponseDto] }) data!: SparePartResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}
