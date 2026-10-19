import { UserRole } from '../src/common/enums/user-role.enum';
import { WorkOrderStatus as S } from '../src/common/enums/work-order-status.enum';
import { allowedNextStatuses, allowedTransitionsFor, checkTransition } from '../src/domain/work-orders/work-order-state-machine';

describe('Work order state machine (RN-04)', () => {
  const happyPath: Array<[S, S, UserRole]> = [
    [S.RECEIVED, S.IN_DIAGNOSIS, UserRole.TECHNICIAN],
    [S.IN_DIAGNOSIS, S.BUDGETED, UserRole.TECHNICIAN],
    [S.BUDGETED, S.APPROVED, UserRole.RECEPTIONIST],
    [S.APPROVED, S.IN_REPAIR, UserRole.TECHNICIAN],
    [S.IN_REPAIR, S.QUALITY_CONTROL, UserRole.TECHNICIAN],
    [S.QUALITY_CONTROL, S.READY_FOR_DELIVERY, UserRole.TECHNICIAN],
    [S.READY_FOR_DELIVERY, S.DELIVERED, UserRole.RECEPTIONIST],
  ];

  it.each(happyPath)('allows %s → %s for %s', (from, to, role) => {
    expect(checkTransition(from, to, role)).toEqual({ allowed: true });
  });

  it('rejects skipping the budget approval (RN-05)', () => {
    expect(checkTransition(S.BUDGETED, S.IN_REPAIR, UserRole.ADMIN)).toEqual({
      allowed: false,
      reason: 'ILLEGAL_TRANSITION',
    });
  });

  it('rejects a technician approving a budget', () => {
    expect(checkTransition(S.BUDGETED, S.APPROVED, UserRole.TECHNICIAN)).toEqual({
      allowed: false,
      reason: 'ROLE_NOT_ALLOWED',
    });
  });

  it('never lets a customer move a work order', () => {
    for (const from of Object.values(S)) {
      for (const to of allowedNextStatuses(from)) {
        expect(checkTransition(from, to, UserRole.CUSTOMER).allowed).toBe(false);
      }
    }
  });

  it('allows QC rework back to IN_REPAIR', () => {
    expect(checkTransition(S.QUALITY_CONTROL, S.IN_REPAIR, UserRole.TECHNICIAN).allowed).toBe(true);
  });

  it('offers each role only the transitions it may trigger (FE-08)', () => {
    expect(allowedTransitionsFor(S.BUDGETED, UserRole.TECHNICIAN)).toEqual([]);
    expect(allowedTransitionsFor(S.BUDGETED, UserRole.RECEPTIONIST).sort()).toEqual([S.APPROVED, S.CANCELLED]);
    expect(allowedTransitionsFor(S.APPROVED, UserRole.TECHNICIAN)).toEqual([S.IN_REPAIR]);
    expect(allowedTransitionsFor(S.IN_REPAIR, UserRole.CUSTOMER)).toEqual([]);
  });

  it('treats DELIVERED as terminal', () => {
    expect(allowedNextStatuses(S.DELIVERED)).toEqual([]);
  });
});
