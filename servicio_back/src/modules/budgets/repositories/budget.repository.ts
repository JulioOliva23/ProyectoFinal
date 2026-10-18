import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const BUDGET_SELECT = {
  id: true,
  workOrderId: true,
  version: true,
  status: true,
  laborSubtotal: true,
  partsSubtotal: true,
  total: true,
  currency: true,
  expiresAt: true,
  sentAt: true,
  decidedAt: true,
  decisionChannel: true,
  rejectionReason: true,
  items: {
    orderBy: { itemType: 'asc' },
    select: { id: true, itemType: true, description: true, sparePartId: true, quantity: true, unitPrice: true, subtotal: true, reservationStatus: true },
  },
} as const satisfies Prisma.BudgetSelect;

export type BudgetRow = Prisma.BudgetGetPayload<{ select: typeof BUDGET_SELECT }>;

export interface NewBudget {
  workOrderId: string;
  createdBy: string;
  expiresAt: Date;
  laborSubtotal: Prisma.Decimal;
  partsSubtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  items: Array<{
    itemType: string;
    description: string;
    sparePartId?: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    subtotal: Prisma.Decimal;
  }>;
}

@Injectable()
export class BudgetRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  findWorkOrderContext(workOrderId: string) {
    return this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, status: true, device: { select: { deviceModelId: true } } },
    });
  }

  findById(id: string, transaction: Prisma.TransactionClient = this.prisma): Promise<BudgetRow | null> {
    return transaction.budget.findUnique({ where: { id }, select: BUDGET_SELECT });
  }

  listForWorkOrder(workOrderId: string): Promise<BudgetRow[]> {
    return this.prisma.budget.findMany({ where: { workOrderId }, select: BUDGET_SELECT, orderBy: { version: 'desc' } });
  }

  // Append-only versioning: open drafts are superseded, never deleted.
  create(budget: NewBudget): Promise<BudgetRow> {
    return this.prisma.$transaction(async (transaction) => {
      const last = await transaction.budget.aggregate({ where: { workOrderId: budget.workOrderId }, _max: { version: true } });
      await transaction.budget.updateMany({
        where: { workOrderId: budget.workOrderId, status: 'DRAFT' },
        data: { status: 'SUPERSEDED' },
      });
      const { items, ...header } = budget;
      return transaction.budget.create({
        data: { ...header, version: (last._max.version ?? 0) + 1, items: { create: items } },
        select: BUDGET_SELECT,
      });
    });
  }

  // Guarded status change: returns false when the budget was not in `from`.
  async changeStatus(
    transaction: Prisma.TransactionClient,
    id: string,
    from: string,
    data: Prisma.BudgetUpdateManyMutationInput & { status: string },
  ): Promise<boolean> {
    const result = await transaction.budget.updateMany({ where: { id, status: from }, data });
    return result.count === 1;
  }

  async supersedeOthers(transaction: Prisma.TransactionClient, workOrderId: string, keepId: string): Promise<void> {
    await transaction.budget.updateMany({
      where: { workOrderId, id: { not: keepId }, status: { in: ['DRAFT', 'SENT'] } },
      data: { status: 'SUPERSEDED' },
    });
  }

  async markExpired(id: string): Promise<void> {
    await this.prisma.budget.updateMany({ where: { id, status: 'SENT' }, data: { status: 'EXPIRED' } });
  }
}
