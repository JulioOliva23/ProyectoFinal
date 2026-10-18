import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateSparePartDto, QuerySparePartsDto, StockAdjustmentDto, StockEntryDto, UpdateSparePartDto } from './dto/spare-part.dto';
import { PaginatedSparePartsDto, SparePartResponseDto } from './dto/spare-part.response.dto';
import { SparePartsService } from './spare-parts.service';

const STAFF = [UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN] as const;

@ApiTags('spare-parts')
@ApiBearerAuth()
@Controller('spare-parts')
export class SparePartsController {
  constructor(private readonly service: SparePartsService) {}

  @Get()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Listar repuestos (filtro por categoría, modelo compatible, texto)' })
  @ApiResponse({ status: 200, type: PaginatedSparePartsDto })
  list(@Query() query: QuerySparePartsDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<SparePartResponseDto>> {
    return this.service.list(query, user.role);
  }

  @Get('alerts/low-stock')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Repuestos con stock disponible <= stock mínimo (RN-11)' })
  @ApiResponse({ status: 200, type: [SparePartResponseDto] })
  lowStock(@CurrentUser() user: AuthenticatedUser): Promise<SparePartResponseDto[]> {
    return this.service.lowStockAlerts(user.role);
  }

  @Get(':id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Detalle de repuesto' })
  @ApiResponse({ status: 200, type: SparePartResponseDto })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<SparePartResponseDto> {
    return this.service.get(id, user.role);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear repuesto en el catálogo' })
  @ApiResponse({ status: 201, type: SparePartResponseDto })
  @ApiResponse({ status: 409, description: 'SKU duplicado' })
  create(@Body() dto: CreateSparePartDto): Promise<SparePartResponseDto> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar datos, precios o compatibilidad' })
  @ApiResponse({ status: 200, type: SparePartResponseDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSparePartDto): Promise<SparePartResponseDto> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar repuesto (borrado lógico)' })
  @ApiResponse({ status: 200, type: SparePartResponseDto })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<SparePartResponseDto> {
    return this.service.deactivate(id);
  }

  @Post(':id/stock-entries')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Registrar ingreso de stock (kardex IN)' })
  @ApiResponse({ status: 201, type: SparePartResponseDto })
  entry(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StockEntryDto, @CurrentUser() user: AuthenticatedUser): Promise<SparePartResponseDto> {
    return this.service.registerEntry(id, dto, user.id);
  }

  @Post(':id/adjustments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ajuste manual de stock con motivo (kardex ADJUSTMENT)' })
  @ApiResponse({ status: 201, type: SparePartResponseDto })
  @ApiResponse({ status: 422, description: 'El ajuste excede el stock disponible' })
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StockAdjustmentDto, @CurrentUser() user: AuthenticatedUser): Promise<SparePartResponseDto> {
    return this.service.adjust(id, dto, user.id);
  }
}
