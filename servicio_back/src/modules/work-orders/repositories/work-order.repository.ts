import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const WORK_ORDER_DETAIL = {
  id: true,
  number: true,
  status: true,
  reportedProblem: true,
  preliminaryDiagnosis: true,
  batteryLevel: true,
  cosmeticCheckIn: true,
  lockType: true,
  unlockCodeCipher: true,
  promisedAt: true,
  deliveredAt: true,
  createdAt: true,
  technicianId: true,
  customerId: true,
  device: { select: { id: true, imei: true, color: true, deviceModel: { select: { brand: true, model: true } } } },
  customer: { select: { id: true, name: true } },
  technician: { select: { id: true, fullName: true } },
} as const;

export type WorkOrderDetailRow = Prisma.WorkOrderGetPayload<{ select: typeof WORK_ORDER_DETAIL }>;

export interface WorkOrderFilter {
  status?: string;
  technicianId?: string;
}

@Injectable()
export class WorkOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  runInTransaction<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }

  create(transaction: Prisma.TransactionClient, data: Prisma.WorkOrderUncheckedCreateInput): Promise<WorkOrderDetailRow> {
    return transaction.workOrder.create({ data, select: WORK_ORDER_DETAIL });
  }

  findDetail(id: string): Promise<WorkOrderDetailRow | null> {
    return this.prisma.workOrder.findUnique({ where: { id }, select: WORK_ORDER_DETAIL });
  }

  async list(filter: WorkOrderFilter, page: number, pageSize: number): Promise<{ rows: WorkOrderDetailRow[]; total: number }> {
    const where: Prisma.WorkOrderWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.technicianId ? { technicianId: filter.technicianId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({ where, select: WORK_ORDER_DETAIL, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.workOrder.count({ where }),
    ]);
    return { rows, total };
  }

  // RN-14: customer view with the current (sent or approved) budget total.
  findForCustomer(customerId: string) {
    return this.prisma.workOrder.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        promisedAt: true,
        updatedAt: true,
        device: { select: { deviceModel: { select: { brand: true, model: true } } } },
        budgets: {
          where: { status: { in: ['SENT', 'APPROVED'] } },
          orderBy: { version: 'desc' },
          take: 1,
          select: { total: true },
        },
      },
    });
  }

  async assignTechnician(id: string, technicianId: string, assignableStatuses: string[]): Promise<boolean> {
    const result = await this.prisma.workOrder.updateMany({
      where: { id, status: { in: assignableStatuses } },
      data: { technicianId },
    });
    return result.count === 1;
  }

  updateDiagnosis(id: string, preliminaryDiagnosis: string): Promise<WorkOrderDetailRow> {
    return this.prisma.workOrder.update({ where: { id }, data: { preliminaryDiagnosis }, select: WORK_ORDER_DETAIL });
  }

  // RN-03: read the cipher and append the access log atomically, so no code
  // is ever revealed without its audit row.
  revealUnlockCipher(id: string, userId: string): Promise<{ lockType: string; unlockCodeCipher: string | null }> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.unlockCodeAccessLog.create({ data: { workOrderId: id, userId } });
      return transaction.workOrder.findUniqueOrThrow({ where: { id }, select: { lockType: true, unlockCodeCipher: true } });
    });
  }

  listAudit(workOrderId: string) {
    return this.prisma.workOrderStatusAudit.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'asc' },
      select: { previousStatus: true, newStatus: true, reason: true, userId: true, createdAt: true, user: { select: { fullName: true } } },
    });
  }

  // Used by WorkflowPreconditionsHook inside the transition transaction.
  hasTechnician(transaction: Prisma.TransactionClient, id: string): Promise<boolean> {
    return transaction.workOrder.count({ where: { id, technicianId: { not: null } } }).then((count) => count === 1);
  }

  hasBudgetInStatus(transaction: Prisma.TransactionClient, workOrderId: string, status: string): Promise<boolean> {
    return transaction.budget.count({ where: { workOrderId, status } }).then((count) => count > 0);
  }
}
