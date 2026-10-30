import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { WorkOrderStatus } from '../../../common/enums/work-order-status.enum';
import { SparePartStockRepository } from '../../spare-parts/repositories/spare-part-stock.repository';
import { WorkOrderTransitionContext, WorkOrderTransitionHook } from './work-order-transition-hook';

// RN-09 — Inventory Stock Guard.
// * Entering IN_REPAIR reserves every PENDING part line of the approved
//   budget. If any part lacks available stock the transition is blocked and
//   the surrounding transaction rolls back every reservation already made.
// * Entering QUALITY_CONTROL consumes the RESERVED lines (physical discount).
// Lines are processed sorted by sparePartId so concurrent transactions lock
// rows in the same order (no deadlocks). Re-entering IN_REPAIR after a failed
// QC finds no PENDING lines and is a no-op.
@Injectable()
export class InventoryStockGuardHook implements WorkOrderTransitionHook {
  readonly name = 'inventory-stock-guard';

  constructor(private readonly stock: SparePartStockRepository) {}

  supports({ to }: WorkOrderTransitionContext): boolean {
    return to === WorkOrderStatus.IN_REPAIR || to === WorkOrderStatus.QUALITY_CONTROL;
  }

  async handle(context: WorkOrderTransitionContext, transaction: Prisma.TransactionClient): Promise<void> {
    if (context.to === WorkOrderStatus.IN_REPAIR) {
      await this.reserveAll(context, transaction);
    } else {
      await this.consumeAll(context, transaction);
    }
  }

  private async reserveAll(context: WorkOrderTransitionContext, transaction: Prisma.TransactionClient): Promise<void> {
    const lines = await this.stock.findApprovedPartLines(transaction, context.workOrderId, 'PENDING');
    const missing: string[] = [];
    for (const line of lines) {
      const reserved = await this.stock.reserve(transaction, line, context.workOrderId, context.userId);
      if (!reserved) missing.push(line.sparePartId);
    }
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        message: 'RN-09: no hay stock suficiente para iniciar la reparación',
        code: 'INSUFFICIENT_STOCK',
        sparePartIds: missing,
      });
    }
  }

  private async consumeAll(context: WorkOrderTransitionContext, transaction: Prisma.TransactionClient): Promise<void> {
    const lines = await this.stock.findApprovedPartLines(transaction, context.workOrderId, 'RESERVED');
    for (const line of lines) {
      const consumed = await this.stock.consume(transaction, line, context.workOrderId, context.userId);
      if (!consumed) {
        throw new UnprocessableEntityException({
          message: 'RN-09: el stock reservado de esta orden es inconsistente',
          code: 'RESERVATION_MISMATCH',
          sparePartIds: [line.sparePartId],
        });
      }
    }
  }
}
