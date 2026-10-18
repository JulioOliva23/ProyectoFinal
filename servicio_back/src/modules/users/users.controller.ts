import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateUserDto, QueryUsersDto } from './dto/create-user.dto';
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
  @ApiOperation({ summary: 'Listar usuarios activos (p. ej. técnicos para asignación)' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  list(@Query() query: QueryUsersDto): Promise<UserResponseDto[]> {
    return this.service.list(query.role);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Desactivar usuario (borrado lógico, BE-18)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.service.deactivate(id);
  }
}
