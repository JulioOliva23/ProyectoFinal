import { BadRequestException, Type as NestType } from '@nestjs/common';
import { createValidationPipe } from '../src/common/validation/validation-messages';
import { CreateBudgetDto } from '../src/modules/budgets/dto/budget.dto';
import { CustomerCheckInDto } from '../src/modules/devices/dto/device-check-in.dto';
import { CreateSparePartDto } from '../src/modules/spare-parts/dto/spare-part.dto';
import { CreateUserDto } from '../src/modules/users/dto/create-user.dto';
import { QueryWorkOrdersDto, TransitionWorkOrderDto } from '../src/modules/work-orders/dto/work-order-actions.dto';

// Boundaries that the specs promise to enforce, checked through the same
// validation pipe the application uses. Tags: [spec/requirement].
async function problems(metatype: NestType<unknown>, payload: object, type: 'body' | 'query' = 'body'): Promise<string[]> {
  try {
    await createValidationPipe().transform(payload, { type, metatype });
    return [];
  } catch (error) {
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
}

const accepted = async (metatype: NestType<unknown>, payload: object, type: 'body' | 'query' = 'body') =>
  expect(await problems(metatype, payload, type)).toEqual([]);
const invalid = async (metatype: NestType<unknown>, payload: object) => expect((await problems(metatype, payload)).length).toBeGreaterThan(0);
const rejected = async (metatype: NestType<unknown>, payload: object, field: string, type: 'body' | 'query' = 'body') =>
  expect((await problems(metatype, payload, type)).join(' | ')).toContain(field);

describe('User accounts [002/RF-1]', () => {
  const user = { username: 'tecnico09', password: 'Str0ngPassword', fullName: 'Técnico Nueve', role: 'TECHNICIAN' };

  it('accepts a well formed account [002/RF-1.1]', () => accepted(CreateUserDto, user));
  it('rejects usernames with uppercase, symbols, 2 or 81 characters [002/RF-1.2]', async () => {
    for (const username of ['Tecnico', 'tec nico', 'ab', 'a'.repeat(81)]) await invalid(CreateUserDto, { ...user, username });
  });
  it('rejects weak passwords: short, no digit, no uppercase, no lowercase [002/RF-1.3]', async () => {
    for (const password of ['Corta1a', 'SinNumeroAqui', 'sinmayuscula1', 'SINMINUSCULA1']) await invalid(CreateUserDto, { ...user, password });
    await accepted(CreateUserDto, { ...user, password: 'Abcdefgh12' });
  });
});

describe('Customer data at intake [003/RF-3.6]', () => {
  const customer = { identification: '5123456', name: 'María Quispe', phone: '+591 71234567', email: 'maria@correo.com' };

  it('accepts complete and minimal customers', async () => {
    await accepted(CustomerCheckInDto, customer);
    await accepted(CustomerCheckInDto, { identification: '5123456', name: 'María Quispe' });
  });
  it('rejects a short document, a short name, a bad phone and a bad email', async () => {
    await rejected(CustomerCheckInDto, { ...customer, identification: '123' }, 'identification');
    await rejected(CustomerCheckInDto, { ...customer, name: 'Al' }, 'name');
    await rejected(CustomerCheckInDto, { ...customer, phone: 'abc' }, 'phone');
    await rejected(CustomerCheckInDto, { ...customer, email: 'no-es-correo' }, 'email');
  });
});

describe('Transition reason [004/RF-10]', () => {
  it('accepts 3 to 500 characters and no reason at all', async () => {
    await accepted(TransitionWorkOrderDto, { to: 'CANCELLED', reason: 'abc' });
    await accepted(TransitionWorkOrderDto, { to: 'CANCELLED', reason: 'a'.repeat(500) });
    await accepted(TransitionWorkOrderDto, { to: 'IN_REPAIR' });
  });
  it('rejects 2 and 501 characters, and an unknown status', async () => {
    await rejected(TransitionWorkOrderDto, { to: 'CANCELLED', reason: 'ab' }, 'reason');
    await rejected(TransitionWorkOrderDto, { to: 'CANCELLED', reason: 'a'.repeat(501) }, 'reason');
    await rejected(TransitionWorkOrderDto, { to: 'FLYING' }, 'to');
  });
});

describe('Order search [005/RF-2.5]', () => {
  it('accepts up to 100 characters and trims the text', async () => {
    const pipe = createValidationPipe();
    const parsed = (await pipe.transform({ search: '  maria  ' }, { type: 'query', metatype: QueryWorkOrdersDto })) as QueryWorkOrdersDto;
    expect(parsed.search).toBe('maria');
    await accepted(QueryWorkOrdersDto, { search: 'a'.repeat(100) }, 'query');
  });
  it('rejects 101 characters', () => rejected(QueryWorkOrdersDto, { search: 'a'.repeat(101) }, 'search', 'query'));
});

describe('Budget lines [006/RF-1.1, RF-1.2]', () => {
  const labor = { itemType: 'LABOR', description: 'Micro-soldadura', quantity: 1, unitPrice: '150.00' };
  const part = { itemType: 'PART', description: 'Pantalla OLED', quantity: 1, sparePartId: '5b2e4f0a-1c3d-4e5f-8a9b-0c1d2e3f4a5b' };

  it('accepts labor and part lines', () => accepted(CreateBudgetDto, { items: [labor, part] }));
  it('requires between 1 and 50 lines', async () => {
    await rejected(CreateBudgetDto, { items: [] }, 'items');
    await rejected(CreateBudgetDto, { items: Array(51).fill(labor) }, 'items');
    await accepted(CreateBudgetDto, { items: Array(50).fill(labor) });
  });
  it('limits quantity to 1..50 and description to at least 3 characters', async () => {
    await rejected(CreateBudgetDto, { items: [{ ...labor, quantity: 0 }] }, 'quantity');
    await rejected(CreateBudgetDto, { items: [{ ...labor, quantity: 51 }] }, 'quantity');
    await rejected(CreateBudgetDto, { items: [{ ...labor, description: 'ab' }] }, 'description');
  });
  it('asks for a price on labor and a spare part on part lines, never a price for parts', async () => {
    await rejected(CreateBudgetDto, { items: [{ ...labor, unitPrice: undefined }] }, 'unitPrice');
    await rejected(CreateBudgetDto, { items: [{ ...part, sparePartId: undefined }] }, 'sparePartId');
  });
});

describe('Spare part catalog [007/RF-1.1]', () => {
  const sparePart = { sku: 'OLED-IP13', name: 'Pantalla OLED', category: 'DISPLAY_OLED', unitCost: '650.00', workshopPrice: '980.00', minStock: 2 };

  it('accepts a complete part', () => accepted(CreateSparePartDto, sparePart));
  it('rejects a lowercase, short or symbol-laden SKU', async () => {
    for (const sku of ['oled-ip13', 'AB', 'OLED IP13', 'A'.repeat(51)]) await invalid(CreateSparePartDto, { ...sparePart, sku });
  });
  it('limits the minimum stock to 0..10000 and the compatible models to 200', async () => {
    await rejected(CreateSparePartDto, { ...sparePart, minStock: 10_001 }, 'minStock');
    await rejected(CreateSparePartDto, { ...sparePart, minStock: -1 }, 'minStock');
    const ids = Array.from({ length: 201 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
    await rejected(CreateSparePartDto, { ...sparePart, compatibleDeviceModelIds: ids }, 'compatibleDeviceModelIds');
  });
  it('rejects an unknown category and money with more than two decimals', async () => {
    await rejected(CreateSparePartDto, { ...sparePart, category: 'MAGIC' }, 'category');
    await rejected(CreateSparePartDto, { ...sparePart, unitCost: '1.234' }, 'unitCost');
  });
});
