import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UnlockCodeCipher } from '../../common/crypto/unlock-code-cipher';
import { money } from '../../common/dto/money';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { allowedTransitionsFor } from '../../domain/work-orders/work-order-state-machine';
import { WORK_ORDER_STATUS_LABELS } from '../../domain/work-orders/work-order-status-labels';
import { formatTrackingCode, generateTrackingCodeDistinctFrom } from '../../domain/work-orders/tracking-code';
import { ACTIVE_STATUSES, OVERDUE_STATUSES, parseWorkOrderSearch } from '../../domain/work-orders/work-order-queries';
import { PublicTrackingRequestDto } from './dto/public-tracking.dto';
import { DevicesService } from '../devices/devices.service';
import { UsersService } from '../users/users.service';
import { CosmeticCheckInDto, CreateWorkOrderDto } from './dto/create-work-order.dto';
import { AssignTechnicianDto, QueryWorkOrdersDto, UpdateDiagnosisDto } from './dto/work-order-actions.dto';
import { LockType } from './dto/work-order-enums';
import {
  CreatedWorkOrderResponseDto,
  CustomerWorkOrderStatusDto,
  TrackingCodeResponseDto,
  UnlockCodeResponseDto,
  WorkOrderAuditEntryDto,
  WorkOrderResponseDto,
  WorkOrderSummaryDto,
} from './dto/work-order.response.dto';
import { CustomerStatusRow, WorkOrderDetailRow, WorkOrderRepository } from './repositories/work-order.repository';

// RN-06: a technician can be (re)assigned until the repair starts.
// SUP-05: same message for "unknown number" and "wrong code" so a lookup
// never reveals which work order numbers exist.
const TRACKING_NOT_FOUND = 'No se encontró la orden o el código de seguimiento no es válido';

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
  async create(dto: CreateWorkOrderDto, user: AuthenticatedUser): Promise<CreatedWorkOrderResponseDto> {
    if (dto.promisedAt && new Date(dto.promisedAt).getTime() <= Date.now()) {
      throw new UnprocessableEntityException('La fecha compromiso debe ser futura');
    }
    // SUP-05: random code, distinct from the unlock code (RN-03), hashed
    // outside the transaction because argon2 is deliberately slow.
    const trackingCode = generateTrackingCodeDistinctFrom(dto.unlockCode);
    const trackingCodeHash = await argon2.hash(trackingCode);
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
        trackingCodeHash,
      });
    });
    return { ...toResponse(order, user), trackingCode: formatTrackingCode(trackingCode) };
  }

  // SUP-05: lost ticket. Issues a new code and invalidates the previous one.
  async regenerateTrackingCode(id: string): Promise<TrackingCodeResponseDto> {
    const order = await this.requireExisting(id);
    const unlockCode = order.unlockCodeCipher ? this.cipher.decrypt(order.unlockCodeCipher) : undefined;
    const trackingCode = generateTrackingCodeDistinctFrom(unlockCode);
    await this.repository.setTrackingCodeHash(id, await argon2.hash(trackingCode));
    return { trackingCode: formatTrackingCode(trackingCode) };
  }

  // SUP-05: anonymous lookup by work order number + tracking code.
  async trackPublicly(dto: PublicTrackingRequestDto): Promise<CustomerWorkOrderStatusDto> {
    const order = await this.repository.findForPublicTracking(dto.number);
    // Verify against a dummy hash when there is nothing to compare, so the
    // response time does not reveal whether the number exists.
    const hash = order?.trackingCodeHash ?? (await dummyHash());
    const matches = await argon2.verify(hash, dto.trackingCode).catch(() => false);
    if (!order?.trackingCodeHash || !matches) throw new NotFoundException(TRACKING_NOT_FOUND);
    // toCustomerStatus copies an explicit field list, so the hash never leaks.
    return toCustomerStatus(order);
  }

  async list(query: QueryWorkOrdersDto, user: AuthenticatedUser): Promise<Paginated<WorkOrderResponseDto>> {
    // RN-06: technicians only ever see their own queue.
    const technicianId = user.role === UserRole.TECHNICIAN ? user.id : query.technicianId;
    const filter = { status: query.status, technicianId, search: parseWorkOrderSearch(query.search) };
    const { rows, total } = await this.repository.list(filter, query.page, query.pageSize);
    return { data: rows.map((row) => toResponse(row, user)), total, page: query.page, pageSize: query.pageSize };
  }

  // Front desk dashboard counters. Every status is listed, zeros included,
  // so the client never has to guess a missing one.
  async summary(now: Date = new Date()): Promise<WorkOrderSummaryDto> {
    const [groups, overdue] = await Promise.all([this.repository.countByStatus(), this.repository.countOverdue(OVERDUE_STATUSES, now)]);
    const counts = new Map(groups.map((group) => [group.status, group.count]));
    const byStatus = Object.values(WorkOrderStatus).map((status) => ({ status, count: counts.get(status) ?? 0 }));
    const active = byStatus.filter((entry) => ACTIVE_STATUSES.includes(entry.status)).reduce((sum, entry) => sum + entry.count, 0);
    return { active, overdue, byStatus };
  }

  async get(id: string, user: AuthenticatedUser): Promise<WorkOrderResponseDto> {
    return toResponse(await this.requireVisible(id, user), user);
  }

  async listForCustomer(user: AuthenticatedUser): Promise<CustomerWorkOrderStatusDto[]> {
    if (!user.customerId) throw new ForbiddenException('RN-14: la cuenta no está vinculada a un cliente');
    return (await this.repository.findForCustomer(user.customerId)).map(toCustomerStatus);
  }

  async assignTechnician(id: string, dto: AssignTechnicianDto, user: AuthenticatedUser): Promise<WorkOrderResponseDto> {
    await this.requireExisting(id);
    await this.users.assertActiveTechnician(dto.technicianId);
    if (!(await this.repository.assignTechnician(id, dto.technicianId, ASSIGNABLE_STATUSES))) {
      throw new ConflictException('RN-06: el técnico solo puede asignarse antes de que empiece la reparación');
    }
    return toResponse(await this.requireExisting(id), user);
  }

  async updateDiagnosis(id: string, dto: UpdateDiagnosisDto, user: AuthenticatedUser): Promise<WorkOrderResponseDto> {
    const order = await this.requireVisible(id, user);
    if (order.status !== WorkOrderStatus.IN_DIAGNOSIS) {
      throw new ConflictException('El diagnóstico solo puede registrarse mientras la orden está En diagnóstico');
    }
    return toResponse(await this.repository.updateDiagnosis(id, dto.preliminaryDiagnosis), user);
  }

  // RN-03: only the assigned technician or an admin; every reveal is logged.
  async revealUnlockCode(id: string, user: AuthenticatedUser): Promise<UnlockCodeResponseDto> {
    const order = await this.requireVisible(id, user);
    if (user.role !== UserRole.ADMIN && order.technicianId !== user.id) {
      throw new ForbiddenException('RN-03: solo el técnico asignado puede revelar el código de desbloqueo');
    }
    if (!order.unlockCodeCipher) throw new NotFoundException('Este equipo no tiene código de desbloqueo');
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
    if (!order) throw new NotFoundException('La orden de trabajo no existe');
    return order;
  }

  // RN-06 / RN-14: ownership check. Foreign orders answer 404 to customers so
  // they cannot probe other customers' ids.
  private async requireVisible(id: string, user: AuthenticatedUser): Promise<WorkOrderDetailRow> {
    const order = await this.requireExisting(id);
    if (user.role === UserRole.TECHNICIAN && order.technicianId !== user.id) {
      throw new ForbiddenException('RN-06: la orden no está asignada a este técnico');
    }
    if (user.role === UserRole.CUSTOMER && order.customerId !== user.customerId) {
      throw new NotFoundException('La orden de trabajo no existe');
    }
    return order;
  }
}

let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash('sup-05-timing-equalizer');
  return dummyHashPromise;
}

// RN-14: single mapping for both customer access modes (SUP-05).
function toCustomerStatus(row: CustomerStatusRow): CustomerWorkOrderStatusDto {
  return {
    id: row.id,
    number: row.number,
    status: row.status as WorkOrderStatus,
    statusLabel: WORK_ORDER_STATUS_LABELS[row.status as WorkOrderStatus],
    device: `${row.device.deviceModel.brand} ${row.device.deviceModel.model}`,
    promisedAt: row.promisedAt,
    budgetTotal: money(row.budgets[0]?.total),
    updatedAt: row.updatedAt,
  };
}

function toResponse(order: WorkOrderDetailRow, viewer: AuthenticatedUser): WorkOrderResponseDto {
  const status = order.status as WorkOrderStatus;
  return {
    id: order.id,
    number: order.number,
    status,
    statusLabel: WORK_ORDER_STATUS_LABELS[status],
    // FE-08: only what this viewer may trigger (a technician only on their own orders).
    allowedTransitions:
      viewer.role === UserRole.TECHNICIAN && order.technicianId !== viewer.id ? [] : allowedTransitionsFor(status, viewer.role),
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
      deviceModelId: order.device.deviceModel.id,
      imei: order.device.imei,
      brand: order.device.deviceModel.brand,
      model: order.device.deviceModel.model,
      color: order.device.color,
    },
    customer: { id: order.customer.id, name: order.customer.name },
    technician: order.technician ? { id: order.technician.id, name: order.technician.fullName } : null,
  };
}
