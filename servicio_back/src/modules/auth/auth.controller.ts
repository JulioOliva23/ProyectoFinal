import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserProfileResponseDto } from './dto/user-profile.response.dto';

// US-00 / BE-T00.4: authentication endpoints. Login and refresh are public
// (@Public exempts them from the global JwtAuthGuard); profile requires an
// authenticated user (BE-19).
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // AI_CONTEXT §6.1: brute-force protection on credentials.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiResponse({ status: 429, description: 'Demasiados intentos de inicio de sesión' })
  @ApiOperation({ summary: 'Iniciar sesión y obtener el par de tokens JWT (US-00)' })
  @ApiResponse({ status: 200, description: 'Credenciales válidas, se emite access + refresh token', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'El cuerpo de la petición es inválido' })
  @ApiResponse({ status: 401, description: 'Credenciales de acceso incorrectas o usuario inactivo' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.service.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar el par de tokens usando el refresh token (US-00)' })
  @ApiResponse({ status: 200, description: 'Nuevo par de tokens emitido', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'El cuerpo de la petición es inválido' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido o expirado' })
  refresh(@Body() dto: RefreshDto): Promise<AuthResponseDto> {
    return this.service.refresh(dto);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión revocando el refresh token en el servidor (US-00, BE-E10)' })
  @ApiResponse({ status: 204, description: 'Refresh token revocado en la denylist' })
  @ApiResponse({ status: 400, description: 'El cuerpo de la petición es inválido' })
  @ApiResponse({ status: 401, description: 'No autenticado o refresh token inválido' })
  logout(@Body() dto: LogoutDto): Promise<void> {
    return this.service.logout(dto);
  }

  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'Obtener el perfil del usuario autenticado (US-00, BE-19)' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario autenticado', type: UserProfileResponseDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  profile(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileResponseDto> {
    return this.service.getProfile(user.id);
  }
}
