import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  NotEquals,
} from 'class-validator';
import { MONEY_PATTERN } from '../../../common/dto/money';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { SparePartCategory } from './spare-part-category.enum';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateSparePartDto {
  @ApiProperty({ example: 'OLED-IP13-ORIG' })
  @Transform(trim)
  @Matches(/^[A-Z0-9-]{3,50}$/, { message: 'El SKU debe tener de 3 a 50 caracteres: mayúsculas, dígitos o guiones' })
  sku!: string;

  @ApiProperty({ example: 'Pantalla OLED iPhone 13 original' })
  @Transform(trim)
  @IsString()
  @Length(3, 150)
  name!: string;

  @ApiProperty({ enum: SparePartCategory })
  @IsEnum(SparePartCategory)
  category!: SparePartCategory;

  @ApiProperty({ example: '650.00', description: 'Costo unitario (RN-15: string decimal)' })
  @Matches(MONEY_PATTERN)
  unitCost!: string;

  @ApiProperty({ example: '980.00', description: 'Precio de venta al cliente' })
  @Matches(MONEY_PATTERN)
  workshopPrice!: string;

  @ApiProperty({ example: 2, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(10_000)
  minStock!: number;

  // RN-10: device models this part fits.
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  compatibleDeviceModelIds?: string[];
}

export class UpdateSparePartDto extends PartialType(OmitType(CreateSparePartDto, ['sku'] as const)) {}

export class QuerySparePartsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SparePartCategory })
  @IsOptional()
  @IsEnum(SparePartCategory)
  category?: SparePartCategory;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo repuestos compatibles con este modelo (RN-10)' })
  @IsOptional()
  @IsUUID()
  deviceModelId?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  search?: string;
}

export class StockEntryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Compra proveedor #F-102' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}

export class StockAdjustmentDto {
  @ApiProperty({ description: 'Delta sobre el stock físico (negativo = merma)', example: -1 })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  @Min(-10_000)
  @Max(10_000)
  delta!: number;

  @ApiProperty({ example: 'Conteo físico: pantalla dañada en almacén' })
  @IsString()
  @Length(5, 500)
  reason!: string;
}
