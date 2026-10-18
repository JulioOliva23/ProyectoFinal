import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MONEY_PATTERN } from '../../../common/dto/money';
import { BudgetItemType, DecisionChannel } from './budget-enums';

export class BudgetItemInputDto {
  @ApiProperty({ enum: BudgetItemType })
  @IsEnum(BudgetItemType)
  itemType!: BudgetItemType;

  @ApiProperty({ example: 'Micro-soldadura de IC de carga' })
  @IsString()
  @Length(3, 255)
  description!: string;

  // PART lines: price comes from the catalog, never from the client.
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((item: BudgetItemInputDto) => item.itemType === BudgetItemType.PART)
  @IsUUID()
  sparePartId?: string;

  @ApiProperty({ minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;

  // LABOR lines: the front desk prices the job (RN-15 string decimal).
  @ApiPropertyOptional({ example: '150.00' })
  @ValidateIf((item: BudgetItemInputDto) => item.itemType === BudgetItemType.LABOR)
  @Matches(MONEY_PATTERN)
  unitPrice?: string;
}

export class CreateBudgetDto {
  @ApiProperty({ type: [BudgetItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BudgetItemInputDto)
  items!: BudgetItemInputDto[];
}

export class ApproveBudgetDto {
  @ApiProperty({ enum: DecisionChannel })
  @IsEnum(DecisionChannel)
  channel!: DecisionChannel;
}

export class RejectBudgetDto {
  @ApiProperty({ enum: DecisionChannel })
  @IsEnum(DecisionChannel)
  channel!: DecisionChannel;

  @ApiProperty({ example: 'El cliente considera que el costo supera el valor del equipo' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class BudgetItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: BudgetItemType }) itemType!: BudgetItemType;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ nullable: true }) sparePartId!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPrice!: string;
  @ApiProperty() subtotal!: string;
  @ApiProperty() reservationStatus!: string;
}

export class BudgetResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workOrderId!: string;
  @ApiProperty() version!: number;
  @ApiProperty() status!: string;
  @ApiProperty() laborSubtotal!: string;
  @ApiProperty() partsSubtotal!: string;
  @ApiProperty() total!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() expiresAt!: Date;
  @ApiPropertyOptional({ nullable: true }) sentAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) decidedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) decisionChannel!: string | null;
  @ApiPropertyOptional({ nullable: true }) rejectionReason!: string | null;
  @ApiProperty({ type: [BudgetItemResponseDto] }) items!: BudgetItemResponseDto[];
}

export class QueryBudgetsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}
