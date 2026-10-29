import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateUserDto, QueryUsersDto, ResetPasswordDto, UpdateUserDto } from './dto/create-user.dto';
import { UserResponseDto } from './dto/user.response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear usuario interno o de cliente' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 409, description: 'Nombre de usuario en uso' })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.service.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Listar usuarios (activos; ADMIN puede incluir desactivados)' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  list(@Query() query: QueryUsersDto, @CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto[]> {
    return this.service.list(query, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar nombre o rol de un usuario (US-21)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 422, description: 'Cambio de rol no permitido (cuenta de cliente o propia)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.service.update(id, dto, user);
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Restablecer la contraseña; cierra las sesiones previas del usuario (US-21)' })
  @ApiResponse({ status: 204, description: 'Contraseña actualizada' })
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto): Promise<void> {
    await this.service.resetPassword(id, dto.password);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reactivar un usuario desactivado (US-21)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.service.activate(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar usuario (borrado lógico, BE-18)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 422, description: 'No se puede desactivar la propia cuenta' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.service.deactivate(id, user);
  }
}
