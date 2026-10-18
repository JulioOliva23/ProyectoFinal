import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { AssignTechnicianDto, QueryWorkOrdersDto, TransitionWorkOrderDto, UpdateDiagnosisDto } from './dto/work-order-actions.dto';
import {
  CustomerWorkOrderStatusDto,
  PaginatedWorkOrdersDto,
  UnlockCodeResponseDto,
  WorkOrderAuditEntryDto,
  WorkOrderResponseDto,
  WorkOrderStatusResponseDto,
} from './dto/work-order.response.dto';
import { WorkOrderTransitionService } from './services/work-order-transition.service';
import { WorkOrdersService } from './work-orders.service';

const STAFF = [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN] as const;

@ApiTags('work-orders')
@ApiBearerAuth()
@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly service: WorkOrdersService,
    private readonly transitions: WorkOrderTransitionService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Recepción: registrar dispositivo y abrir OT (RN-01, RN-02, RN-03)' })
  @ApiResponse({ status: 201, type: WorkOrderResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos (IMEI Luhn, código de desbloqueo, check-in)' })
  @ApiResponse({ status: 409, description: 'IMEI registrado con otro modelo' })
  create(@Body() dto: CreateWorkOrderDto, @CurrentUser() user: AuthenticatedUser): Promise<WorkOrderResponseDto> {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Listar OTs (técnico: solo asignadas, RN-06)' })
  @ApiResponse({ status: 200, type: PaginatedWorkOrdersDto })
  list(@Query() query: QueryWorkOrdersDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<WorkOrderResponseDto>> {
    return this.service.list(query, user);
  }

  @Get('mine')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Cliente: estado de mis OTs (RN-14)' })
  @ApiResponse({ status: 200, type: [CustomerWorkOrderStatusDto] })
  mine(@CurrentUser() user: AuthenticatedUser): Promise<CustomerWorkOrderStatusDto[]> {
    return this.service.listForCustomer(user);
  }

  @Get(':id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Detalle de OT' })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  @ApiResponse({ status: 403, description: 'OT no asignada al técnico' })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<WorkOrderResponseDto> {
    return this.service.get(id, user);
  }

  @Post(':id/assign-technician')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Asignar técnico (RN-06)' })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignTechnicianDto): Promise<WorkOrderResponseDto> {
    return this.service.assignTechnician(id, dto);
  }

  @Patch(':id/diagnosis')
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Registrar diagnóstico preliminar' })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  diagnosis(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiagnosisDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WorkOrderResponseDto> {
    return this.service.updateDiagnosis(id, dto, user);
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Cambiar estado de la OT (máquina de estados RN-04, Stock Guard RN-09, auditoría RN-12)' })
  @ApiResponse({ status: 200, type: WorkOrderStatusResponseDto })
  @ApiResponse({ status: 403, description: 'Rol no permitido u OT no asignada' })
  @ApiResponse({ status: 409, description: 'Transición ilegal o concurrente' })
  @ApiResponse({ status: 422, description: 'Precondición no cumplida o stock insuficiente' })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionWorkOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WorkOrderStatusResponseDto> {
    return this.transitions.transition({ workOrderId: id, to: dto.to, reason: dto.reason, userId: user.id, role: user.role });
  }

  @Post(':id/unlock-code/reveal')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Revelar código de desbloqueo (técnico asignado; queda auditado, RN-03)' })
  @ApiResponse({ status: 200, type: UnlockCodeResponseDto })
  reveal(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<UnlockCodeResponseDto> {
    return this.service.revealUnlockCode(id, user);
  }

  @Get(':id/audit')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Historial inmutable de cambios de estado (RN-12)' })
  @ApiResponse({ status: 200, type: [WorkOrderAuditEntryDto] })
  audit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<WorkOrderAuditEntryDto[]> {
    return this.service.getAudit(id, user);
  }
}
