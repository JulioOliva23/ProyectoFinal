import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { UserRole } from '../../common/enums/user-role.enum';
import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AppConfigService } from '../config/app-config.service';
import { SparePartsService } from '../spare-parts/spare-parts.service';
import { WorkOrderTransitionService } from '../work-orders/services/work-order-transition.service';
import { BudgetItemType, BudgetStatus } from './dto/budget-enums';
import { ApproveBudgetDto, BudgetResponseDto, CreateBudgetDto, RejectBudgetDto } from './dto/budget.dto';
import { BudgetRepository, BudgetRow, NewBudget } from './repositories/budget.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
// A budget can be (re)drafted while diagnosing or after one was already sent.
const BUDGETABLE = [WorkOrderStatus.IN_DIAGNOSIS, WorkOrderStatus.BUDGETED];

@Injectable()
export class BudgetsService {
  constructor(
    private readonly repository: BudgetRepository,
    private readonly spareParts: SparePartsService,
    private readonly transitions: WorkOrderTransitionService,
    private readonly config: AppConfigService,
  ) {}

  async create(workOrderId: string, dto: CreateBudgetDto, user: AuthenticatedUser): Promise<BudgetResponseDto> {
    const order = await this.repository.findWorkOrderContext(workOrderId);
    if (!order) throw new NotFoundException('La orden de trabajo no existe');
    if (!BUDGETABLE.includes(order.status as WorkOrderStatus)) {
      throw new ConflictException('Solo se puede armar un presupuesto mientras la orden está En diagnóstico o Presupuestada');
    }

    // RN-10 + catalog pricing for PART lines.
    const partIds = dto.items.flatMap((item) => (item.itemType === BudgetItemType.PART && item.sparePartId ? [item.sparePartId] : []));
    const prices = partIds.length > 0 ? await this.spareParts.priceCompatibleParts(partIds, order.device.deviceModelId) : new Map();

    const items: NewBudget['items'] = dto.items.map((item) => {
      const unitPrice =
        item.itemType === BudgetItemType.PART
          ? prices.get(item.sparePartId as string)!.workshopPrice
          : new Prisma.Decimal(item.unitPrice as string);
      return {
        itemType: item.itemType,
        description: item.description,
        sparePartId: item.itemType === BudgetItemType.PART ? item.sparePartId : undefined,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice.mul(item.quantity),
      };
    });
    const sum = (type: BudgetItemType) =>
      items.filter((item) => item.itemType === type).reduce((acc, item) => acc.add(item.subtotal), new Prisma.Decimal(0));
    const laborSubtotal = sum(BudgetItemType.LABOR);
    const partsSubtotal = sum(BudgetItemType.PART);

    const budget = await this.repository.create({
      workOrderId,
      createdBy: user.id,
      // Provisional; reset when the budget is actually sent (RN-08).
      expiresAt: this.expiryFrom(new Date()),
      laborSubtotal,
      partsSubtotal,
      total: laborSubtotal.add(partsSubtotal),
      items,
    });
    return toResponse(budget);
  }

  async listForWorkOrder(workOrderId: string): Promise<BudgetResponseDto[]> {
    if (!(await this.repository.findWorkOrderContext(workOrderId))) throw new NotFoundException('La orden de trabajo no existe');
    return (await this.repository.listForWorkOrder(workOrderId)).map(toResponse);
  }

  async get(id: string): Promise<BudgetResponseDto> {
    return toResponse(await this.require(id));
  }

  // DRAFT → SENT. The first sent budget moves the order to BUDGETED; a
  // re-budget supersedes the previous SENT version (RN-08).
  async send(id: string, user: AuthenticatedUser): Promise<BudgetResponseDto> {
    const budget = await this.require(id);
    const order = await this.repository.findWorkOrderContext(budget.workOrderId);
    const now = new Date();
    const saved = await this.repository.runInTransaction(async (transaction) => {
      if (!(await this.repository.changeStatus(transaction, id, BudgetStatus.DRAFT, { status: BudgetStatus.SENT, sentAt: now, expiresAt: this.expiryFrom(now) }))) {
        throw new ConflictException('Solo se pueden enviar presupuestos en borrador');
      }
      await this.repository.supersedeOthers(transaction, budget.workOrderId, id);
      if (order?.status === WorkOrderStatus.IN_DIAGNOSIS) {
        await this.transitions.transitionWithin(transaction, this.transitionRequest(budget.workOrderId, WorkOrderStatus.BUDGETED, user));
      }
      return this.repository.findById(id, transaction);
    });
    return toResponse(saved as BudgetRow);
  }

  // RN-05: explicit customer approval, recorded with the channel used.
  async approve(id: string, dto: ApproveBudgetDto, user: AuthenticatedUser): Promise<BudgetResponseDto> {
    const budget = await this.requireDecidable(id);
    const saved = await this.repository.runInTransaction(async (transaction) => {
      if (!(await this.repository.changeStatus(transaction, id, BudgetStatus.SENT, this.decision(BudgetStatus.APPROVED, dto.channel, user)))) {
        throw new ConflictException('El presupuesto ya no está esperando una decisión');
      }
      await this.transitions.transitionWithin(transaction, this.transitionRequest(budget.workOrderId, WorkOrderStatus.APPROVED, user));
      return this.repository.findById(id, transaction);
    });
    return toResponse(saved as BudgetRow);
  }

  async reject(id: string, dto: RejectBudgetDto, user: AuthenticatedUser): Promise<BudgetResponseDto> {
    const budget = await this.requireDecidable(id);
    const saved = await this.repository.runInTransaction(async (transaction) => {
      const data = { ...this.decision(BudgetStatus.REJECTED, dto.channel, user), rejectionReason: dto.reason };
      if (!(await this.repository.changeStatus(transaction, id, BudgetStatus.SENT, data))) {
        throw new ConflictException('El presupuesto ya no está esperando una decisión');
      }
      await this.transitions.transitionWithin(transaction, {
        ...this.transitionRequest(budget.workOrderId, WorkOrderStatus.CANCELLED, user),
        reason: `Budget rejected: ${dto.reason}`,
      });
      return this.repository.findById(id, transaction);
    });
    return toResponse(saved as BudgetRow);
  }

  private async requireDecidable(id: string): Promise<BudgetRow> {
    const budget = await this.require(id);
    if (budget.status !== BudgetStatus.SENT) throw new ConflictException('Solo se puede decidir sobre presupuestos enviados');
    // RN-08: expired budgets are closed and must be re-issued.
    if (budget.expiresAt.getTime() < Date.now()) {
      await this.repository.markExpired(id);
      throw new UnprocessableEntityException('RN-08: el presupuesto venció, emita una nueva versión');
    }
    return budget;
  }

  private async require(id: string): Promise<BudgetRow> {
    const budget = await this.repository.findById(id);
    if (!budget) throw new NotFoundException('El presupuesto no existe');
    return budget;
  }

  private expiryFrom(date: Date): Date {
    return new Date(date.getTime() + this.config.getBudgetValidityDays() * DAY_MS);
  }

  private decision(status: BudgetStatus, channel: string, user: AuthenticatedUser) {
    return { status, decisionChannel: channel, decidedAt: new Date(), decidedBy: user.id };
  }

  private transitionRequest(workOrderId: string, to: WorkOrderStatus, user: AuthenticatedUser) {
    return { workOrderId, to, userId: user.id, role: user.role as UserRole };
  }
}

function toResponse(budget: BudgetRow): BudgetResponseDto {
  return {
    id: budget.id,
    workOrderId: budget.workOrderId,
    version: budget.version,
    status: budget.status,
    laborSubtotal: budget.laborSubtotal.toFixed(2),
    partsSubtotal: budget.partsSubtotal.toFixed(2),
    total: budget.total.toFixed(2),
    currency: budget.currency,
    expiresAt: budget.expiresAt,
    sentAt: budget.sentAt,
    decidedAt: budget.decidedAt,
    decisionChannel: budget.decisionChannel,
    rejectionReason: budget.rejectionReason,
    items: budget.items.map((item) => ({
      id: item.id,
      itemType: item.itemType as BudgetItemType,
      description: item.description,
      sparePartId: item.sparePartId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      subtotal: item.subtotal.toFixed(2),
      reservationStatus: item.reservationStatus,
    })),
  };
}
