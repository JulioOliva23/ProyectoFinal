import { Module } from '@nestjs/common';
import { SparePartsModule } from '../spare-parts/spare-parts.module';
import { AuditTrailHook } from './hooks/audit-trail.hook';
import { InventoryStockGuardHook } from './hooks/inventory-stock-guard.hook';
import { WORK_ORDER_TRANSITION_HOOKS } from './hooks/work-order-transition-hook';
import { WorkflowPreconditionsHook } from './hooks/workflow-preconditions.hook';
import { WorkOrderAuditRepository } from './repositories/work-order-audit.repository';
import { WorkOrderTransitionRepository } from './repositories/work-order-transition.repository';
import { WorkOrderRepository } from './repositories/work-order.repository';
import { WorkOrderTransitionService } from './services/work-order-transition.service';

// RN-04: the transition pipeline. Hook order matters:
// preconditions → stock guard → audit trail (always last).
@Module({
  imports: [SparePartsModule],
  providers: [
    WorkOrderRepository,
    WorkOrderAuditRepository,
    WorkOrderTransitionRepository,
    WorkflowPreconditionsHook,
    InventoryStockGuardHook,
    AuditTrailHook,
    {
      provide: WORK_ORDER_TRANSITION_HOOKS,
      useFactory: (preconditions: WorkflowPreconditionsHook, stockGuard: InventoryStockGuardHook, auditTrail: AuditTrailHook) => [
        preconditions,
        stockGuard,
        auditTrail,
      ],
      inject: [WorkflowPreconditionsHook, InventoryStockGuardHook, AuditTrailHook],
    },
    WorkOrderTransitionService,
  ],
  exports: [WorkOrderTransitionService, WorkOrderRepository, WorkOrderAuditRepository],
})
export class WorkOrderTransitionsModule {}
