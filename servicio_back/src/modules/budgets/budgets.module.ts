import { Module } from '@nestjs/common';
import { SparePartsModule } from '../spare-parts/spare-parts.module';
import { WorkOrderTransitionsModule } from '../work-orders/work-order-transitions.module';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetRepository } from './repositories/budget.repository';

@Module({
  imports: [SparePartsModule, WorkOrderTransitionsModule],
  controllers: [BudgetsController],
  providers: [BudgetRepository, BudgetsService],
})
export class BudgetsModule {}
