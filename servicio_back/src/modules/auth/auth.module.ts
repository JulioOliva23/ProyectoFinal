import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RevokedRefreshTokenRepository } from './repositories/revoked-refresh-token.repository';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';

// BE-02: auth module owns internal authentication (US-00), JWT strategy.
// The public customer tracking query (RN-17) lives in PublicTrackingModule.
// UserRepository lives in the users module (BE-P02) and is imported from here.
@Module({
  imports: [PassportModule, JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService, RevokedRefreshTokenRepository],
})
export class AuthModule {}
