import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { BudgetsService } from './budgets.service';
import { ApproveBudgetDto, BudgetResponseDto, CreateBudgetDto, RejectBudgetDto } from './dto/budget.dto';

// RN-07: budgets carry sale prices, so technicians have no access here.
const FRONT_DESK = [UserRole.ADMIN, UserRole.RECEPTIONIST] as const;

@ApiTags('budgets')
@ApiBearerAuth()
@Controller()
export class BudgetsController {
  constructor(private readonly service: BudgetsService) {}

  @Post('work-orders/:workOrderId/budgets')
  @Roles(...FRONT_DESK)
  @ApiOperation({ summary: 'Crear versión DRAFT de presupuesto (labor + repuestos compatibles, RN-10)' })
  @ApiResponse({ status: 201, type: BudgetResponseDto })
  @ApiResponse({ status: 422, description: 'Repuesto incompatible o inactivo' })
  create(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @Body() dto: CreateBudgetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BudgetResponseDto> {
    return this.service.create(workOrderId, dto, user);
  }

  @Get('work-orders/:workOrderId/budgets')
  @Roles(...FRONT_DESK)
  @ApiOperation({ summary: 'Listar versiones de presupuesto de una OT' })
  @ApiResponse({ status: 200, type: [BudgetResponseDto] })
  list(@Param('workOrderId', ParseUUIDPipe) workOrderId: string): Promise<BudgetResponseDto[]> {
    return this.service.listForWorkOrder(workOrderId);
  }

  @Get('budgets/:id')
  @Roles(...FRONT_DESK)
  @ApiOperation({ summary: 'Detalle de presupuesto' })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BudgetResponseDto> {
    return this.service.get(id);
  }

  @Post('budgets/:id/send')
  @HttpCode(HttpStatus.OK)
  @Roles(...FRONT_DESK)
  @ApiOperation({ summary: 'Enviar presupuesto al cliente; fija vencimiento (RN-08)' })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  send(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<BudgetResponseDto> {
    return this.service.send(id, user);
  }

  @Post('budgets/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(...FRONT_DESK)
  @ApiOperation({ summary: 'Registrar aprobación del cliente; OT pasa a APPROVED (RN-05)' })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  @ApiResponse({ status: 422, description: 'Presupuesto vencido (RN-08)' })
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveBudgetDto, @CurrentUser() user: AuthenticatedUser): Promise<BudgetResponseDto> {
    return this.service.approve(id, dto, user);
  }

  @Post('budgets/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(...FRONT_DESK)
  @ApiOperation({ summary: 'Registrar rechazo del cliente; OT pasa a CANCELLED' })
  @ApiResponse({ status: 200, type: BudgetResponseDto })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectBudgetDto, @CurrentUser() user: AuthenticatedUser): Promise<BudgetResponseDto> {
    return this.service.reject(id, dto, user);
  }
}
