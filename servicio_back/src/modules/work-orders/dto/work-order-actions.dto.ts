import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { WorkOrderStatus } from '../../../common/enums/work-order-status.enum';

export class AssignTechnicianDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  technicianId!: string;
}

export class UpdateDiagnosisDto {
  @ApiProperty({ example: 'Display OLED fisurado; flex de carga oxidado' })
  @IsString()
  @Length(5, 2000)
  preliminaryDiagnosis!: string;
}

export class TransitionWorkOrderDto {
  @ApiProperty({ enum: WorkOrderStatus })
  @IsEnum(WorkOrderStatus)
  to!: WorkOrderStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  reason?: string;
}

export class QueryWorkOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: WorkOrderStatus })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  technicianId?: string;
}
