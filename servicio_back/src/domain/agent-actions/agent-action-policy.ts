import { UserRole } from '../../common/enums/user-role.enum';
import { WorkOrderStatus } from '../../common/enums/work-order-status.enum';

// AG-01: an agent never changes a work order by itself. It files a proposal
// that a person approves or rejects; only the approval runs the transition,
// with the approver's identity and role (RN-04, RN-06, RN-12).
export enum AgentActionStatus {
  PENDING = 'PENDING',
  EXECUTED = 'EXECUTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

// AG-02: a proposal nobody decides on goes stale; the order may have moved.
export const AGENT_ACTION_TTL_MS = 15 * 60_000;
export const AGENT_REASON_MAX_LENGTH = 400;

export interface AgentAction {
  id: string;
  workOrderId: string;
  workOrderNumber: number;
  technicianId: string | null;
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  reason: string;
  // Roles the state machine accepts for from → to: who can approve it.
  approverRoles: UserRole[];
  status: AgentActionStatus;
  requestedBy: { id: string; role: UserRole };
  decidedBy?: { id: string; role: UserRole };
  decisionNote?: string;
  // Last execution error (e.g. INSUFFICIENT_STOCK); the proposal stays
  // pending so the person can fix the cause and approve again.
  lastError?: string;
  createdAt: Date;
  expiresAt: Date;
  decidedAt?: Date;
}

// AG-03: free text written by a model is untrusted input. Strip control
// characters and markup, collapse whitespace and cap the length before it
// reaches the audit trail or the UI.
export function sanitizeAgentText(raw: string, maxLength = AGENT_REASON_MAX_LENGTH): string {
  const withoutInvisible = [...raw.replace(/<[^>]*>/g, ' ')].map((char) => (isInvisible(char) ? ' ' : char)).join('');
  return withoutInvisible.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

// C0/C1 control characters, zero-width marks and bidi overrides (text that
// renders differently from what it says).
function isInvisible(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

export function isExpired(action: Pick<AgentAction, 'expiresAt'>, now: Date): boolean {
  return now.getTime() >= action.expiresAt.getTime();
}

export type DecisionCheck =
  | { allowed: true }
  | { allowed: false; reason: 'NOT_PENDING' | 'EXPIRED' | 'SELF_DECISION' | 'NOT_ASSIGNED' | 'ROLE_NOT_ALLOWED' };

// AG-04: four-eyes rule. The account that proposed (the agent's) cannot
// decide; a technician decides only on orders assigned to them (RN-06); an
// approval needs a role the state machine accepts. A rejection is open to any
// staff member who can see the order.
export function checkDecision(
  action: AgentAction,
  decider: { id: string; role: UserRole },
  kind: 'approve' | 'reject',
  now: Date,
): DecisionCheck {
  if (action.status !== AgentActionStatus.PENDING) return { allowed: false, reason: 'NOT_PENDING' };
  if (isExpired(action, now)) return { allowed: false, reason: 'EXPIRED' };
  if (action.requestedBy.id === decider.id) return { allowed: false, reason: 'SELF_DECISION' };
  if (decider.role === UserRole.TECHNICIAN && action.technicianId !== decider.id) {
    return { allowed: false, reason: 'NOT_ASSIGNED' };
  }
  if (kind === 'approve' && !action.approverRoles.includes(decider.role)) {
    return { allowed: false, reason: 'ROLE_NOT_ALLOWED' };
  }
  return { allowed: true };
}

// Which proposals a staff member sees (list and live stream).
export function isVisibleTo(action: Pick<AgentAction, 'technicianId'>, user: { id: string; role: UserRole }): boolean {
  if (user.role === UserRole.TECHNICIAN) return action.technicianId === user.id;
  return user.role === UserRole.ADMIN || user.role === UserRole.RECEPTIONIST;
}
