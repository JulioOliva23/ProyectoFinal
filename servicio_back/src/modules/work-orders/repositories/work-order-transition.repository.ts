import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class WorkOrderTransitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  // BE-16: single entry point for transactional transitions. ReadCommitted
  // plus the guarded updates below is enough; no table-level locks.
  runInTransaction<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  findForTransition(transaction: Prisma.TransactionClient, workOrderId: string) {
    return transaction.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, status: true, technicianId: true },
    });
  }

  // Optimistic compare-and-set: only succeeds if nobody changed the status in
  // between. Returns false on a lost race.
  async compareAndSetStatus(
    transaction: Prisma.TransactionClient,
    workOrderId: string,
    expected: string,
    next: string,
  ): Promise<boolean> {
    const result = await transaction.workOrder.updateMany({
      where: { id: workOrderId, status: expected },
      data: { status: next, ...(next === 'DELIVERED' ? { deliveredAt: new Date() } : {}) },
    });
    return result.count === 1;
  }
}
