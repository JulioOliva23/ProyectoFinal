import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { WorkOrderStatus } from '../../../common/enums/work-order-status.enum';
import { AGENT_REASON_MAX_LENGTH, AgentActionStatus } from '../../../domain/agent-actions/agent-action-policy';

export class PreviewTransitionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workOrderId!: string;

  @ApiProperty({ enum: WorkOrderStatus })
  @IsEnum(WorkOrderStatus)
  to!: WorkOrderStatus;
}

export class ProposeTransitionDto extends PreviewTransitionDto {
  @ApiProperty({ minLength: 10, maxLength: AGENT_REASON_MAX_LENGTH, description: 'Justificación que verá la persona que aprueba (AG-03)' })
  @IsString()
  @Length(10, AGENT_REASON_MAX_LENGTH)
  reason!: string;
}

export class DecideAgentActionDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @Length(3, 300)
  note?: string;
}

export class QueryAgentActionsDto {
  @ApiPropertyOptional({ enum: AgentActionStatus })
  @IsOptional()
  @IsEnum(AgentActionStatus)
  status?: AgentActionStatus;
}

export class TransitionPreviewDto {
  @ApiProperty({ format: 'uuid' }) workOrderId!: string;
  @ApiProperty() workOrderNumber!: number;
  @ApiProperty({ enum: WorkOrderStatus }) from!: WorkOrderStatus;
  @ApiProperty({ enum: WorkOrderStatus }) to!: WorkOrderStatus;
  @ApiProperty({ description: 'La máquina de estados acepta from → to (RN-04)' }) legal!: boolean;
  @ApiProperty({ enum: UserRole, isArray: true, description: 'Roles que pueden aprobarla' }) approverRoles!: UserRole[];
  @ApiProperty({ enum: WorkOrderStatus, isArray: true }) legalNextStatuses!: WorkOrderStatus[];
  @ApiProperty({ type: [String], description: 'Precondiciones que se verificarán al ejecutar (RN-05, RN-06, RN-09)' })
  checksOnExecution!: string[];
}

export class AgentActorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
}

export class AgentActionResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) workOrderId!: string;
  @ApiProperty() workOrderNumber!: number;
  @ApiProperty({ enum: WorkOrderStatus }) from!: WorkOrderStatus;
  @ApiProperty({ enum: WorkOrderStatus }) to!: WorkOrderStatus;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: UserRole, isArray: true }) approverRoles!: UserRole[];
  @ApiProperty({ enum: AgentActionStatus }) status!: AgentActionStatus;
  @ApiProperty({ type: AgentActorDto }) requestedBy!: AgentActorDto;
  @ApiPropertyOptional({ type: AgentActorDto }) decidedBy?: AgentActorDto;
  @ApiPropertyOptional() decisionNote?: string;
  @ApiPropertyOptional() lastError?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() expiresAt!: Date;
  @ApiPropertyOptional() decidedAt?: Date;
}
