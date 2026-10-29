import { WorkOrderStatus } from '../src/common/enums/work-order-status.enum';
import { ACTIVE_STATUSES, OVERDUE_STATUSES, parseWorkOrderSearch } from '../src/domain/work-orders/work-order-queries';

describe('parseWorkOrderSearch', () => {
  it('ignores empty or blank input', () => {
    expect(parseWorkOrderSearch(undefined)).toBeUndefined();
    expect(parseWorkOrderSearch('   ')).toBeUndefined();
  });

  it.each([
    ['OT-000123', 123],
    ['ot123', 123],
    ['123', 123],
  ])('reads "%s" as work order number %d', (raw, number) => {
    expect(parseWorkOrderSearch(raw)).toEqual({ text: raw, number });
  });

  it('keeps free text without a number (customer name, phone fragments)', () => {
    expect(parseWorkOrderSearch('  María Quispe ')).toEqual({ text: 'María Quispe' });
    expect(parseWorkOrderSearch('+591 7')).toEqual({ text: '+591 7' });
  });

  it('does not read numbers beyond the INTEGER column as work order numbers', () => {
    // A full IMEI is still searchable by text, but never as a number.
    expect(parseWorkOrderSearch('352099001761481')).toEqual({ text: '352099001761481' });
    expect(parseWorkOrderSearch('0')).toEqual({ text: '0' });
  });
});

describe('dashboard status groups', () => {
  it('treats every non-terminal status as active', () => {
    expect(ACTIVE_STATUSES).not.toContain(WorkOrderStatus.DELIVERED);
    expect(ACTIVE_STATUSES).not.toContain(WorkOrderStatus.CANCELLED);
    expect(ACTIVE_STATUSES).toHaveLength(Object.values(WorkOrderStatus).length - 2);
  });

  it('never counts an order ready for pickup as overdue', () => {
    expect(OVERDUE_STATUSES).not.toContain(WorkOrderStatus.READY_FOR_DELIVERY);
    expect(OVERDUE_STATUSES).toContain(WorkOrderStatus.IN_REPAIR);
  });
});
