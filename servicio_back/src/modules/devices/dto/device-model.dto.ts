import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateDeviceModelDto {
  @ApiProperty({ example: 'Apple' })
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  brand!: string;

  @ApiProperty({ example: 'iPhone 13' })
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  model!: string;
}

// US-21: rename or (de)activate a model (ADMIN).
export class UpdateDeviceModelDto {
  @ApiPropertyOptional({ example: 'Apple' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  brand?: string;

  @ApiPropertyOptional({ example: 'iPhone 13' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryDeviceModelsDto {
  @ApiPropertyOptional({ default: false, description: 'Incluir modelos desactivados (solo ADMIN)' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive?: boolean;
}

export class DeviceModelResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() brand!: string;
  @ApiProperty() model!: string;
  @ApiProperty() isActive!: boolean;
}
