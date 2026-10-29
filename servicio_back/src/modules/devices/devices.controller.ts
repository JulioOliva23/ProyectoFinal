import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DeviceHistoryResponseDto } from './dto/device-history.response.dto';
import { CreateDeviceModelDto, DeviceModelResponseDto, QueryDeviceModelsDto, UpdateDeviceModelDto } from './dto/device-model.dto';
import { DevicesService } from './devices.service';
import { ParseImeiPipe } from './pipes/parse-imei.pipe';

@ApiTags('devices')
@ApiBearerAuth()
@Controller()
export class DevicesController {
  constructor(private readonly service: DevicesService) {}

  @Get('devices/by-imei/:imei')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Buscar dispositivo por IMEI con su historial de reparaciones (RN-13)' })
  @ApiResponse({ status: 200, type: DeviceHistoryResponseDto })
  @ApiResponse({ status: 400, description: 'IMEI inválido (RN-02)' })
  @ApiResponse({ status: 404, description: 'Dispositivo no registrado' })
  byImei(@Param('imei', ParseImeiPipe) imei: string): Promise<DeviceHistoryResponseDto> {
    return this.service.getHistoryByImei(imei);
  }

  @Get('device-models')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.TECHNICIAN)
  @ApiOperation({ summary: 'Listar modelos comerciales activos (ADMIN puede incluir desactivados)' })
  @ApiResponse({ status: 200, type: [DeviceModelResponseDto] })
  listModels(@Query() query: QueryDeviceModelsDto, @CurrentUser() user: AuthenticatedUser): Promise<DeviceModelResponseDto[]> {
    return this.service.listModels(user, query.includeInactive);
  }

  @Post('device-models')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar un modelo comercial' })
  @ApiResponse({ status: 201, type: DeviceModelResponseDto })
  @ApiResponse({ status: 409, description: 'Marca y modelo ya registrados' })
  createModel(@Body() dto: CreateDeviceModelDto): Promise<DeviceModelResponseDto> {
    return this.service.createModel(dto.brand, dto.model);
  }

  @Patch('device-models/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Renombrar o activar/desactivar un modelo comercial (US-21)' })
  @ApiResponse({ status: 200, type: DeviceModelResponseDto })
  @ApiResponse({ status: 409, description: 'Marca y modelo ya registrados' })
  updateModel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeviceModelDto): Promise<DeviceModelResponseDto> {
    return this.service.updateModel(id, dto);
  }
}
