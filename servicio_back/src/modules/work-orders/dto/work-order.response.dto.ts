import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkOrderStatus } from '../../../common/enums/work-order-status.enum';
import { CosmeticCheckInDto } from './create-work-order.dto';
import { LockType } from './work-order-enums';

class WorkOrderDeviceDto {
  @ApiProperty() id!: string;
  // RN-10: lets the budget builder list only compatible parts.
  @ApiProperty() deviceModelId!: string;
  @ApiProperty() imei!: string;
  @ApiProperty() brand!: string;
  @ApiProperty() model!: string;
  @ApiProperty({ type: String, nullable: true  }) color!: string | null;
}

class WorkOrderPersonDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

// RN-03: the unlock code is never part of this DTO; only whether one exists.
export class WorkOrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ enum: WorkOrderStatus }) status!: WorkOrderStatus;
  @ApiProperty() statusLabel!: string;
  @ApiProperty({ enum: WorkOrderStatus, isArray: true }) allowedTransitions!: WorkOrderStatus[];
  @ApiProperty() reportedProblem!: string;
  @ApiProperty({ type: String, nullable: true  }) preliminaryDiagnosis!: string | null;
  @ApiProperty({ type: Number, nullable: true  }) batteryLevel!: number | null;
  @ApiProperty({ type: CosmeticCheckInDto }) cosmeticCheckIn!: CosmeticCheckInDto;
  @ApiProperty({ enum: LockType }) lockType!: LockType;
  @ApiProperty() hasUnlockCode!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true  }) promisedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true  }) deliveredAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: WorkOrderDeviceDto }) device!: WorkOrderDeviceDto;
  @ApiProperty({ type: WorkOrderPersonDto }) customer!: WorkOrderPersonDto;
  @ApiPropertyOptional({ type: WorkOrderPersonDto, nullable: true }) technician!: WorkOrderPersonDto | null;
}

export class PaginatedWorkOrdersDto {
  @ApiProperty({ type: [WorkOrderResponseDto] }) data!: WorkOrderResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

// RN-14: what a CUSTOMER may see. No technical notes, no unlock data, no costs.
export class CustomerWorkOrderStatusDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ enum: WorkOrderStatus }) status!: WorkOrderStatus;
  @ApiProperty() statusLabel!: string;
  @ApiProperty() device!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true  }) promisedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: 'Total del presupuesto vigente'  }) budgetTotal!: string | null;
  @ApiProperty() updatedAt!: Date;
}

export class WorkOrderAuditEntryDto {
  @ApiProperty({ enum: WorkOrderStatus }) previousStatus!: WorkOrderStatus;
  @ApiProperty({ enum: WorkOrderStatus }) newStatus!: WorkOrderStatus;
  @ApiProperty({ type: String, nullable: true  }) reason!: string | null;
  @ApiProperty() userId!: string;
  @ApiProperty() userName!: string;
  @ApiProperty() createdAt!: Date;
}

export class UnlockCodeResponseDto {
  @ApiProperty({ enum: LockType }) lockType!: LockType;
  @ApiProperty() unlockCode!: string;
}

export class WorkOrderStatusResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: WorkOrderStatus }) status!: WorkOrderStatus;
}

// SUP-05: the plain tracking code is returned ONLY here, once, so it can be
// printed on the intake ticket. Only its hash is stored.
export class CreatedWorkOrderResponseDto extends WorkOrderResponseDto {
  @ApiProperty({ example: 'K7QM-3XPA', description: 'Código de seguimiento para el portal del cliente (se muestra una sola vez)' })
  trackingCode!: string;
}

export class TrackingCodeResponseDto {
  @ApiProperty({ example: 'K7QM-3XPA' }) trackingCode!: string;
}
