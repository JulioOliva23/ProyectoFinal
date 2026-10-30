import { Body, Controller, Get, HttpCode, HttpStatus, MessageEvent, Param, ParseUUIDPipe, Post, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable, interval, map, merge } from 'rxjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AgentAction } from '../../domain/agent-actions/agent-action-policy';
import { AgentActionsService } from './agent-actions.service';
import {
  AgentActionResponseDto,
  DecideAgentActionDto,
  PreviewTransitionDto,
  ProposeTransitionDto,
  QueryAgentActionsDto,
  TransitionPreviewDto,
} from './dto/agent-action.dto';

const STAFF = [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN] as const;
// Hosting proxies close idle connections; a comment-like ping keeps the stream open.
const HEARTBEAT_MS = 25_000;

// AG-01: agents (through the MCP server) propose; people decide here.
@ApiTags('agent-actions')
@ApiBearerAuth()
@Controller('agent-actions')
export class AgentActionsController {
  constructor(private readonly service: AgentActionsService) {}

  @Get('state-machine')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Tabla de transiciones y roles (RN-04), publicada como recurso MCP' })
  stateMachine(): ReturnType<AgentActionsService['stateMachine']> {
    return this.service.stateMachine();
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Simular una transición sin ejecutarla (dry run)' })
  @ApiResponse({ status: 200, type: TransitionPreviewDto })
  preview(@Body() dto: PreviewTransitionDto, @CurrentUser() user: AuthenticatedUser): Promise<TransitionPreviewDto> {
    return this.service.preview(dto, user);
  }

  @Post()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Proponer un cambio de estado; queda pendiente de aprobación humana (AG-01)' })
  @ApiResponse({ status: 201, type: AgentActionResponseDto })
  @ApiResponse({ status: 409, description: 'Transición ilegal desde el estado actual' })
  async propose(@Body() dto: ProposeTransitionDto, @CurrentUser() user: AuthenticatedUser): Promise<AgentActionResponseDto> {
    return toResponse(await this.service.propose(dto, user));
  }

  @Get()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Listar propuestas visibles para el usuario' })
  @ApiResponse({ status: 200, type: [AgentActionResponseDto] })
  list(@Query() query: QueryAgentActionsDto, @CurrentUser() user: AuthenticatedUser): AgentActionResponseDto[] {
    return this.service.list(user, query.status).map(toResponse);
  }

  // Declared before ':id' so "stream" is not taken for an id.
  @Sse('stream')
  @Roles(...STAFF)
  @ApiProduces('text/event-stream')
  @ApiOperation({ summary: 'Eventos en vivo de propuestas (SSE): created / updated / ping' })
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    const events = this.service.stream(user).pipe(map(({ type, action }) => ({ type, data: toResponse(action) })));
    const heartbeat = interval(HEARTBEAT_MS).pipe(map(() => ({ type: 'ping', data: { at: new Date().toISOString() } })));
    return merge(events, heartbeat);
  }

  @Get(':id')
  @Roles(...STAFF)
  @ApiResponse({ status: 200, type: AgentActionResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): AgentActionResponseDto {
    return toResponse(this.service.get(id, user));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Aprobar y ejecutar la propuesta como el usuario actual (AG-04, RN-04)' })
  @ApiResponse({ status: 200, type: AgentActionResponseDto })
  @ApiResponse({ status: 403, description: 'Quien propuso no puede aprobar, o el rol/OT no corresponde' })
  @ApiResponse({ status: 409, description: 'Ya decidida, vencida o la OT cambió de estado' })
  @ApiResponse({ status: 422, description: 'Precondición no cumplida o stock insuficiente' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAgentActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AgentActionResponseDto> {
    return toResponse(await this.service.approve(id, user, dto.note));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Rechazar la propuesta' })
  @ApiResponse({ status: 200, type: AgentActionResponseDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAgentActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): AgentActionResponseDto {
    return toResponse(this.service.reject(id, user, dto.note));
  }
}

// technicianId is internal (used for visibility only).
function toResponse(action: AgentAction): AgentActionResponseDto {
  const response: AgentActionResponseDto & Partial<Pick<AgentAction, 'technicianId'>> = { ...action };
  delete response.technicianId;
  return response;
}
