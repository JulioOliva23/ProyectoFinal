import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { WorkOrderAuditRepository } from '../repositories/work-order-audit.repository';
import { WorkOrderTransitionContext, WorkOrderTransitionHook } from './work-order-transition-hook';

// RN-12 — Audit Trail. Runs for every transition, last in the chain, inside
// the same transaction: if the audit row cannot be written the status change
// is rolled back too. timestamp comes from the DB default (created_at) and
// user_id from the JWT (BE-19), never from the request body.
@Injectable()
export class AuditTrailHook implements WorkOrderTransitionHook {
  readonly name = 'audit-trail';

  constructor(private readonly audit: WorkOrderAuditRepository) {}

  supports(): boolean {
    return true;
  }

  handle(context: WorkOrderTransitionContext, transaction: Prisma.TransactionClient): Promise<void> {
    return this.audit.append(transaction, {
      workOrderId: context.workOrderId,
      userId: context.userId,
      previousStatus: context.from,
      newStatus: context.to,
      reason: context.reason,
    });
  }
}
