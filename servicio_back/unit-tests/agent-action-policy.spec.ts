import { UserRole } from '../src/common/enums/user-role.enum';
import { WorkOrderStatus as S } from '../src/common/enums/work-order-status.enum';
import {
  AgentAction,
  AgentActionStatus,
  checkDecision,
  isVisibleTo,
  sanitizeAgentText,
} from '../src/domain/agent-actions/agent-action-policy';
import { rolesAllowedFor, transitionTable } from '../src/domain/work-orders/work-order-state-machine';

const now = new Date('2026-10-30T12:00:00Z');

function action(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: 'a-1',
    workOrderId: 'wo-1',
    workOrderNumber: 12,
    technicianId: 'tech-1',
    from: S.APPROVED,
    to: S.IN_REPAIR,
    reason: 'Repuestos en stock y presupuesto aprobado',
    approverRoles: [UserRole.TECHNICIAN, UserRole.ADMIN],
    status: AgentActionStatus.PENDING,
    requestedBy: { id: 'agent-user', role: UserRole.ADMIN },
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    ...overrides,
  };
}

describe('sanitizeAgentText (AG-03)', () => {
  it('strips markup, control and bidi characters and collapses whitespace', () => {
    expect(sanitizeAgentText('  <script>x</script>Cambio\n\tde‮ estado\u0000 ')).toBe('x Cambio de estado');
  });

  it('caps the length', () => {
    expect(sanitizeAgentText('a'.repeat(1000))).toHaveLength(400);
  });
});

describe('checkDecision (AG-04)', () => {
  it('allows a different staff member with an accepted role to approve', () => {
    expect(checkDecision(action(), { id: 'tech-1', role: UserRole.TECHNICIAN }, 'approve', now)).toEqual({ allowed: true });
  });

  it('rejects the account that proposed deciding its own proposal', () => {
    expect(checkDecision(action(), { id: 'agent-user', role: UserRole.ADMIN }, 'approve', now)).toEqual({
      allowed: false,
      reason: 'SELF_DECISION',
    });
  });

  it('rejects an expired proposal (AG-02)', () => {
    const late = new Date(now.getTime() + 120_000);
    expect(checkDecision(action(), { id: 'admin-1', role: UserRole.ADMIN }, 'approve', late)).toEqual({ allowed: false, reason: 'EXPIRED' });
  });

  it('rejects deciding twice (AG-01)', () => {
    const decided = action({ status: AgentActionStatus.EXECUTED });
    expect(checkDecision(decided, { id: 'admin-1', role: UserRole.ADMIN }, 'reject', now)).toEqual({ allowed: false, reason: 'NOT_PENDING' });
  });

  it('keeps a technician away from orders not assigned to them (RN-06)', () => {
    expect(checkDecision(action(), { id: 'tech-2', role: UserRole.TECHNICIAN }, 'reject', now)).toEqual({
      allowed: false,
      reason: 'NOT_ASSIGNED',
    });
  });

  it('lets a receptionist reject but not approve a repair start (RN-04)', () => {
    const receptionist = { id: 'rec-1', role: UserRole.RECEPTIONIST };
    expect(checkDecision(action(), receptionist, 'reject', now)).toEqual({ allowed: true });
    expect(checkDecision(action(), receptionist, 'approve', now)).toEqual({ allowed: false, reason: 'ROLE_NOT_ALLOWED' });
  });
});

describe('isVisibleTo', () => {
  it('shows technicians only their assigned orders (RN-06) and front desk everything', () => {
    expect(isVisibleTo(action(), { id: 'tech-2', role: UserRole.TECHNICIAN })).toBe(false);
    expect(isVisibleTo(action(), { id: 'rec-1', role: UserRole.RECEPTIONIST })).toBe(true);
    expect(isVisibleTo(action(), { id: 'c-1', role: UserRole.CUSTOMER })).toBe(false);
  });
});

describe('state machine exports for agents (RN-04)', () => {
  it('lists the roles allowed for a transition and none for an illegal one', () => {
    expect(rolesAllowedFor(S.READY_FOR_DELIVERY, S.DELIVERED)).toEqual([UserRole.RECEPTIONIST, UserRole.ADMIN]);
    expect(rolesAllowedFor(S.RECEIVED, S.DELIVERED)).toEqual([]);
  });

  it('returns a copy of the table that cannot alter the real one', () => {
    const table = transitionTable();
    table[S.APPROVED][S.IN_REPAIR]?.push(UserRole.CUSTOMER);
    expect(rolesAllowedFor(S.APPROVED, S.IN_REPAIR)).not.toContain(UserRole.CUSTOMER);
  });
});
