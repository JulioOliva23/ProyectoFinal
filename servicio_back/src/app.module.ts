import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import Joi from 'joi';
import { UsersModule } from './modules/users/users.module';
import { AppConfigModule } from './modules/config/config.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { DevicesModule } from './modules/devices/devices.module';
import { SparePartsModule } from './modules/spare-parts/spare-parts.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { AgentActionsModule } from './modules/agent-actions/agent-actions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true, 
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        // BE-E14: explicit token lifetimes, no silent default.
        JWT_EXPIRES_IN: Joi.string().pattern(/^\d+\s*[smhd]$/).required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().pattern(/^\d+\s*[smhd]$/).required(),
        // RN-03: unlock codes are encrypted at rest with AES-256-GCM.
        UNLOCK_CODE_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
        BUDGET_VALIDITY_DAYS: Joi.number().integer().min(1).max(90).default(7),
      }) 
    }), 
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 10,
      },
    ]),
    JwtModule.register({}), 
    PrismaModule, 
    AppConfigModule,
    UsersModule,
    AuthModule,
    CryptoModule,
    // Core domain modules (AI_CONTEXT.md §6).
    DevicesModule,
    SparePartsModule,
    WorkOrdersModule,
    BudgetsModule,
    // AG-01: agent proposals with human approval (MCP server → people).
    AgentActionsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // BE-E08: global auth + RBAC. @Public() marks public endpoints (login,
    // refresh, swagger).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
