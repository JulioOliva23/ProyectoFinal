import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { UnlockCodeCipher } from '../../common/crypto/unlock-code-cipher';
import { money } from '../../common/dto/money';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { allowedNextStatuses } from '../../domain/work-orders/work-order-state-machine';
import { WORK_ORDER_STATUS_LABELS } from '../../domain/work-orders/work-order-status-labels';
import { DevicesService } from '../devices/devices.service';
import { UsersService } from '../users/users.service';
import { CosmeticCheckInDto, CreateWorkOrderDto } from './dto/create-work-order.dto';
import { AssignTechnicianDto, QueryWorkOrdersDto, UpdateDiagnosisDto } from './dto/work-order-actions.dto';
import { LockType } from './dto/work-order-enums';
import {
  CustomerWorkOrderStatusDto,
  UnlockCodeResponseDto,
  WorkOrderAuditEntryDto,
  WorkOrderResponseDto,
} from './dto/work-order.response.dto';
import { WorkOrderDetailRow, WorkOrderRepository } from './repositories/work-order.repository';

// RN-06: a technician can be (re)assigned until the repair starts.
const ASSIGNABLE_STATUSES = [WorkOrderStatus.RECEIVED, WorkOrderStatus.IN_DIAGNOSIS, WorkOrderStatus.BUDGETED, WorkOrderStatus.APPROVED];

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly repository: WorkOrderRepository,
    private readonly devices: DevicesService,
    private readonly users: UsersService,
    private readonly cipher: UnlockCodeCipher,
  ) {}

  // RN-01: intake. Device + customer + order are created atomically.
  async create(dto: CreateWorkOrderDto, user: AuthenticatedUser): Promise<WorkOrderResponseDto> {
    if (dto.promisedAt && new Date(dto.promisedAt).getTime() <= Date.now()) {
      throw new UnprocessableEntityException('promisedAt must be in the future');
    }
    const order = await this.repository.runInTransaction(async (transaction) => {
      const checkedIn = await this.devices.checkIn(transaction, dto.device, dto.customer);
      return this.repository.create(transaction, {
        deviceId: checkedIn.deviceId,
        customerId: checkedIn.customerId,
        receptionistId: user.id,
        reportedProblem: dto.reportedProblem,
        batteryLevel: dto.batteryLevel,
        cosmeticCheckIn: { ...dto.cosmeticCheckIn },
        lockType: dto.lockType,
        // RN-03: encrypted before it reaches the repository.
        unlockCodeCipher: dto.unlockCode ? this.cipher.encrypt(dto.unlockCode) : null,
        promisedAt: dto.promisedAt ? new Date(dto.promisedAt) : null,
      });
    });
    return toResponse(order);
  }

  async list(query: QueryWorkOrdersDto, user: AuthenticatedUser): Promise<Paginated<WorkOrderResponseDto>> {
    // RN-06: technicians only ever see their own queue.
    const technicianId = user.role === UserRole.TECHNICIAN ? user.id : query.technicianId;
    const { rows, total } = await this.repository.list({ status: query.status, technicianId }, query.page, query.pageSize);
    return { data: rows.map(toResponse), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string, user: AuthenticatedUser): Promise<WorkOrderResponseDto> {
    return toResponse(await this.requireVisible(id, user));
  }

  async listForCustomer(user: AuthenticatedUser): Promise<CustomerWorkOrderStatusDto[]> {
    if (!user.customerId) throw new ForbiddenException('RN-14: account is not bound to a customer');
    const rows = await this.repository.findForCustomer(user.customerId);
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status as WorkOrderStatus,
      statusLabel: WORK_ORDER_STATUS_LABELS[row.status as WorkOrderStatus],
      device: `${row.device.deviceModel.brand} ${row.device.deviceModel.model}`,
      promisedAt: row.promisedAt,
      budgetTotal: money(row.budgets[0]?.total),
      updatedAt: row.updatedAt,
    }));
  }

  async assignTechnician(id: string, dto: AssignTechnicianDto): Promise<WorkOrderResponseDto> {
    await this.requireExisting(id);
    await this.users.assertActiveTechnician(dto.technicianId);
    if (!(await this.repository.assignTechnician(id, dto.technicianId, ASSIGNABLE_STATUSES))) {
      throw new ConflictException('RN-06: technician can only be assigned before the repair starts');
    }
    return toResponse(await this.requireExisting(id));
  }

  async updateDiagnosis(id: string, dto: UpdateDiagnosisDto, user: AuthenticatedUser): Promise<WorkOrderResponseDto> {
    const order = await this.requireVisible(id, user);
    if (order.status !== WorkOrderStatus.IN_DIAGNOSIS) {
      throw new ConflictException('Diagnosis can only be recorded while the order is IN_DIAGNOSIS');
    }
    return toResponse(await this.repository.updateDiagnosis(id, dto.preliminaryDiagnosis));
  }

  // RN-03: only the assigned technician or an admin; every reveal is logged.
  async revealUnlockCode(id: string, user: AuthenticatedUser): Promise<UnlockCodeResponseDto> {
    const order = await this.requireVisible(id, user);
    if (user.role !== UserRole.ADMIN && order.technicianId !== user.id) {
      throw new ForbiddenException('RN-03: only the assigned technician can reveal the unlock code');
    }
    if (!order.unlockCodeCipher) throw new NotFoundException('This device has no unlock code');
    const stored = await this.repository.revealUnlockCipher(id, user.id);
    return { lockType: stored.lockType as LockType, unlockCode: this.cipher.decrypt(stored.unlockCodeCipher as string) };
  }

  async getAudit(id: string, user: AuthenticatedUser): Promise<WorkOrderAuditEntryDto[]> {
    await this.requireVisible(id, user);
    const rows = await this.repository.listAudit(id);
    return rows.map((row) => ({
      previousStatus: row.previousStatus as WorkOrderStatus,
      newStatus: row.newStatus as WorkOrderStatus,
      reason: row.reason,
      userId: row.userId,
      userName: row.user.fullName,
      createdAt: row.createdAt,
    }));
  }

  private async requireExisting(id: string): Promise<WorkOrderDetailRow> {
    const order = await this.repository.findDetail(id);
    if (!order) throw new NotFoundException('Work order not found');
    return order;
  }

  // RN-06 / RN-14: ownership check. Foreign orders answer 404 to customers so
  // they cannot probe other customers' ids.
  private async requireVisible(id: string, user: AuthenticatedUser): Promise<WorkOrderDetailRow> {
    const order = await this.requireExisting(id);
    if (user.role === UserRole.TECHNICIAN && order.technicianId !== user.id) {
      throw new ForbiddenException('RN-06: work order is not assigned to this technician');
    }
    if (user.role === UserRole.CUSTOMER && order.customerId !== user.customerId) {
      throw new NotFoundException('Work order not found');
    }
    return order;
  }
}

function toResponse(order: WorkOrderDetailRow): WorkOrderResponseDto {
  const status = order.status as WorkOrderStatus;
  return {
    id: order.id,
    number: order.number,
    status,
    statusLabel: WORK_ORDER_STATUS_LABELS[status],
    allowedTransitions: allowedNextStatuses(status),
    reportedProblem: order.reportedProblem,
    preliminaryDiagnosis: order.preliminaryDiagnosis,
    batteryLevel: order.batteryLevel,
    cosmeticCheckIn: order.cosmeticCheckIn as unknown as CosmeticCheckInDto,
    lockType: order.lockType as LockType,
    hasUnlockCode: order.unlockCodeCipher !== null,
    promisedAt: order.promisedAt,
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
    device: {
      id: order.device.id,
      imei: order.device.imei,
      brand: order.device.deviceModel.brand,
      model: order.device.deviceModel.model,
      color: order.device.color,
    },
    customer: { id: order.customer.id, name: order.customer.name },
    technician: order.technician ? { id: order.technician.id, name: order.technician.fullName } : null,
  };
}
