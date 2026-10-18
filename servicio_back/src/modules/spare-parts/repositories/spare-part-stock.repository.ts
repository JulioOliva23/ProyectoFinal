import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';

export interface BudgetPartLine {
  budgetItemId: string;
  sparePartId: string;
  quantity: number;
}

// BE-08 / BE-16: stock primitives that only run inside a caller-provided
// transaction. Every mutation is a guarded conditional update so concurrent
// transitions can never drive a stock column below zero.
@Injectable()
export class SparePartStockRepository {
  // RN-09: true when the reservation was applied; false when available stock
  // was insufficient at write time (the row did not match the guard).
  async reserve(transaction: Prisma.TransactionClient, line: BudgetPartLine, workOrderId: string, userId: string): Promise<boolean> {
    const updated = await transaction.sparePart.updateMany({
      where: { id: line.sparePartId, isActive: true, availableStock: { gte: line.quantity } },
      data: {
        availableStock: { decrement: line.quantity },
        reservedStock: { increment: line.quantity },
        lastMovementAt: new Date(),
      },
    });
    if (updated.count !== 1) return false;

    await transaction.budgetItem.update({
      where: { id: line.budgetItemId },
      data: { reservationStatus: 'RESERVED' },
    });
    await transaction.stockMovement.create({
      data: { sparePartId: line.sparePartId, workOrderId, userId, type: 'RESERVE', quantity: line.quantity },
    });
    return true;
  }

  // RN-09: reserved units leave the shelf once the repair is finished.
  async consume(transaction: Prisma.TransactionClient, line: BudgetPartLine, workOrderId: string, userId: string): Promise<boolean> {
    const updated = await transaction.sparePart.updateMany({
      where: {
        id: line.sparePartId,
        reservedStock: { gte: line.quantity },
        physicalStock: { gte: line.quantity },
      },
      data: {
        reservedStock: { decrement: line.quantity },
        physicalStock: { decrement: line.quantity },
        lastMovementAt: new Date(),
      },
    });
    if (updated.count !== 1) return false;

    await transaction.budgetItem.update({
      where: { id: line.budgetItemId },
      data: { reservationStatus: 'CONSUMED' },
    });
    await transaction.stockMovement.create({
      data: { sparePartId: line.sparePartId, workOrderId, userId, type: 'OUT', quantity: line.quantity },
    });
    return true;
  }

  findApprovedPartLines(
    transaction: Prisma.TransactionClient,
    workOrderId: string,
    reservationStatus: 'PENDING' | 'RESERVED',
  ): Promise<BudgetPartLine[]> {
    return transaction.budgetItem
      .findMany({
        where: {
          itemType: 'PART',
          reservationStatus,
          sparePartId: { not: null },
          budget: { workOrderId, status: 'APPROVED' },
        },
        select: { id: true, sparePartId: true, quantity: true },
        orderBy: { sparePartId: 'asc' },
      })
      .then((rows) =>
        rows.map((row) => ({ budgetItemId: row.id, sparePartId: row.sparePartId as string, quantity: row.quantity })),
      );
  }
}
