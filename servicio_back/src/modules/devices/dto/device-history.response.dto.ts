import { ApiProperty } from '@nestjs/swagger';
import { WorkOrderStatus } from '../../../common/enums/work-order-status.enum';
import { DeviceModelResponseDto } from './device-model.dto';

export class DeviceRepairEntryDto {
  @ApiProperty() workOrderId!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ enum: WorkOrderStatus }) status!: WorkOrderStatus;
  @ApiProperty() reportedProblem!: string;
  @ApiProperty({ type: String, nullable: true  }) preliminaryDiagnosis!: string | null;
  @ApiProperty({ type: String, nullable: true  }) technicianName!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true  }) deliveredAt!: Date | null;
}

// RN-13: permanent repair history shown when an IMEI is looked up.
export class DeviceHistoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() imei!: string;
  @ApiProperty({ type: String, nullable: true  }) color!: string | null;
  @ApiProperty({ type: DeviceModelResponseDto }) deviceModel!: DeviceModelResponseDto;
  @ApiProperty() customerName!: string;
  @ApiProperty({ type: [DeviceRepairEntryDto] }) repairs!: DeviceRepairEntryDto[];
}
