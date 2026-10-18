import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';

export interface StatusAuditEntry {
  workOrderId: string;
  userId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

// RN-12 / BE-17: append-only. This repository deliberately exposes no update
// or delete method; the database trigger rejects them anyway.
@Injectable()
export class WorkOrderAuditRepository {
  async append(transaction: Prisma.TransactionClient, entry: StatusAuditEntry): Promise<void> {
    await transaction.workOrderStatusAudit.create({ data: entry });
  }
}
