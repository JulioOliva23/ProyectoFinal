import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';

export const DEFAULT_LABOR_HOURLY_RATE = '80';
export const DEFAULT_BUDGET_VALIDITY_DAYS = 7;

// BE-P02: typed access to service configuration. Business rules never read
// raw env keys directly.
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  getLaborHourlyRate(): Prisma.Decimal {
    return new Prisma.Decimal(
      this.configService.get<string>('LABOR_HOURLY_RATE') ?? DEFAULT_LABOR_HOURLY_RATE,
    );
  }

  // RN-08: budget expiration window.
  getBudgetValidityDays(): number {
    return Number(this.configService.get<string>('BUDGET_VALIDITY_DAYS') ?? DEFAULT_BUDGET_VALIDITY_DAYS);
  }
}
