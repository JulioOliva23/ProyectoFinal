import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import type { StringValue } from 'ms';
import { UserRole } from '../../common/enums/user-role.enum';
import { UserRepository } from '../users/repositories/user.repository';
import { RevokedRefreshTokenRepository } from './repositories/revoked-refresh-token.repository';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserProfileResponseDto } from './dto/user-profile.response.dto';

// US-00 / BE-27: JWT access + refresh tokens signed via Passport JWT library,
// keys and expirations are configurable via environment variables.
const INVALID_CREDENTIALS = 'Credenciales de acceso incorrectas o usuario inactivo';

export interface AuthUser {
  id: string;
  fullName: string;
  username: string;
  role: UserRole;
  isActive: boolean;
}

interface RefreshTokenClaims {
  sub: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

// BE-E10: payload after verification always carries a jti (tokens minted
// before revocation support are rejected), so callers can rely on it.
type VerifiedRefreshToken = {
  sub: string;
  jti: string;
  iat?: number;
  exp?: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: UserRepository,
    private readonly revocation: RevokedRefreshTokenRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    try {
      const user = await this.repository.findByUsername(dto.username.trim());
      // RNF-3: verify against a dummy hash when there is no account, so the
      // response time does not reveal whether the username exists.
      const hash = user?.passwordHash ?? (await dummyHash());
      const passwordValid = await argon2.verify(hash, dto.password).catch(() => false);
      if (!user || !user.isActive || !passwordValid) {
        // US-00: unified message hides whether the account exists or is inactive.
        throw new UnauthorizedException(INVALID_CREDENTIALS);
      }

      return await this.buildAuthResponse(user);
    } catch (error: unknown) {
      // Keep the real cause visible during local diagnosis without logging credentials or tokens.
      this.logger.error('Auth login failed:', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async refresh(dto: RefreshDto): Promise<AuthResponseDto> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);

    const user = await this.repository.findActiveById(payload.sub);
    if (!user) throw new UnauthorizedException('Usuario no encontrado o inactivo');

    // US-21: an admin edit (role, password, reactivation) bumps updated_at;
    // refresh tokens minted before it no longer renew the session. Compared
    // in whole seconds because `iat` has no milliseconds.
    if (payload.iat !== undefined && user.updatedAt && payload.iat < Math.floor(user.updatedAt.getTime() / 1000)) {
      throw new UnauthorizedException('La cuenta cambió, vuelva a iniciar sesión');
    }

    // BE-E10 / US-00: reuse of a revoked jti means the token family leaked.
    // Every session of the user ends (bumping updated_at invalidates all the
    // refresh tokens minted so far); the denylist rows stay, so the reused
    // token and the already rotated ones can never come back to life.
    if (await this.revocation.findByJti(payload.jti)) {
      await this.repository.invalidateSessions(user.id);
      throw new UnauthorizedException('Refresh token reutilizado o revocado');
    }

    // Rotation: the used token becomes unusable, a fresh pair is issued.
    const expiresAt = payload.exp ? new Date(payload.exp * 1000) : new Date();
    await this.revocation.create({ jti: payload.jti, userId: user.id, expiresAt });
    await this.revocation.deleteExpired(new Date());
    return this.buildAuthResponse(user);
  }

  async logout(dto: LogoutDto): Promise<void> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);

    // Idempotent: revoking an already revoked token is a success (204).
    if (!(await this.revocation.findByJti(payload.jti))) {
      const expiresAt = payload.exp ? new Date(payload.exp * 1000) : new Date();
      await this.revocation.create({ jti: payload.jti, userId: payload.sub, expiresAt });
    }
  }

  private async verifyRefreshToken(refreshToken: string): Promise<VerifiedRefreshToken> {
    let payload: RefreshTokenClaims;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenClaims>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    // Tokens minted before BE-E10 carried no jti and cannot participate in
    // rotation/revocation; treat them as invalid.
    if (!payload.jti) throw new UnauthorizedException('Refresh token inválido o expirado');
    return payload as VerifiedRefreshToken;
  }

  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const user = await this.repository.findActiveById(userId);
    if (!user) throw new UnauthorizedException('Usuario no encontrado o inactivo');
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role as UserRole,
      isActive: user.isActive,
    };
  }

  private async buildAuthResponse(user: {
    id: string;
    fullName: string;
    username: string;
    role: string;
    customerId?: string | null;
  }): Promise<AuthResponseDto> {
    const accessSecret = this.config.getOrThrow<string>('JWT_SECRET');
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const accessExpires = this.config.getOrThrow<StringValue>('JWT_EXPIRES_IN');
    const refreshExpires = this.config.getOrThrow<StringValue>('JWT_REFRESH_EXPIRES_IN');

    const accessToken = await this.jwt.signAsync(
      // RN-14: CUSTOMER tokens carry the customer they are bound to.
      { role: user.role, ...(user.customerId ? { customerId: user.customerId } : {}) },
      { secret: accessSecret, expiresIn: accessExpires, subject: user.id },
    );
    const refreshToken = await this.jwt.signAsync(
      { jti: randomUUID() },
      { secret: refreshSecret, expiresIn: refreshExpires, subject: user.id },
    );

    return {
      accessToken,
      refreshToken,
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role as UserRole,
    };
  }
}

let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash('rnf-3-timing-equalizer');
  return dummyHashPromise;
}
