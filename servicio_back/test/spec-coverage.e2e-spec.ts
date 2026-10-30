import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createValidationPipe } from '../src/common/validation/validation-messages';
import { PrismaService } from '../src/prisma/prisma.service';

// Requirements of the specs that only a real database can confirm: atomicity,
// ownership transfer, append-only tables and role checks. Tags look like
// [003/RF-2.2]: spec number / requirement.
describe('Spec coverage over PostgreSQL (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = randomUUID().slice(0, 8);
  const password = `E2e-${randomUUID()}`;
  const tokens = { admin: '', recep: '', tech: '', customer: '', unlinked: '' };
  let techId: string;
  let recepId: string;
  let modelId: string;
  let otherModelId: string;
  let customerId: string;

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });

  function imei(seed: number): string {
    const body = `35${run.replace(/\D/g, '').padEnd(6, '3').slice(0, 6)}${String(seed).padStart(6, '0')}`;
    let sum = 0;
    for (let i = 0; i < 14; i += 1) {
      let digit = Number(body[13 - i]);
      if (i % 2 === 0) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return body + String((10 - (sum % 10)) % 10);
  }

  function intake(seed: number, identification: string, deviceModelId = modelId) {
    return {
      customer: { identification, name: `Cliente ${identification}` },
      device: { imei: imei(seed), deviceModelId },
      reportedProblem: 'No carga el equipo',
      cosmeticCheckIn: { screen: 'OK', backCover: 'OK', frame: 'OK', cameraLens: 'OK', buttons: 'OK' },
      lockType: 'PIN',
      unlockCode: '4821',
    };
  }

  async function login(username: string): Promise<string> {
    return (await http().post('/api/v1/auth/login').send({ username, password }).expect(200)).body.accessToken as string;
  }

  async function budgetedOrder(seed: number): Promise<{ orderId: string; budgetId: string }> {
    const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(seed, `E2E-${run}`)).expect(201);
    const orderId = created.body.id as string;
    await http().post(`/api/v1/work-orders/${orderId}/assign-technician`).set(as('recep')).send({ technicianId: techId }).expect(200);
    await http().post(`/api/v1/work-orders/${orderId}/transitions`).set(as('tech')).send({ to: 'IN_DIAGNOSIS' }).expect(200);
    const budget = await http()
      .post(`/api/v1/work-orders/${orderId}/budgets`)
      .set(as('recep'))
      .send({ items: [{ itemType: 'LABOR', description: 'Diagnóstico de placa', quantity: 1, unitPrice: '50.00' }] })
      .expect(201);
    await http().post(`/api/v1/budgets/${budget.body.id}/send`).set(as('recep')).expect(200);
    return { orderId, budgetId: budget.body.id as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);

    const customer = await prisma.customer.create({ data: { identification: `E2E-${run}`, name: 'Cliente base' } });
    customerId = customer.id;
    const passwordHash = await argon2.hash(password);
    const make = (name: string, role: string, linked?: string) =>
      prisma.user.create({ data: { username: `${name}-${run}`, passwordHash, fullName: `${role} ${run}`, role, customerId: linked } });
    await make('admin', 'ADMIN');
    recepId = (await make('recep', 'RECEPTIONIST')).id;
    techId = (await make('tech', 'TECHNICIAN')).id;
    await make('cust', 'CUSTOMER', customerId);
    await make('unlinked', 'CUSTOMER');
    tokens.admin = await login(`admin-${run}`);
    tokens.recep = await login(`recep-${run}`);
    tokens.tech = await login(`tech-${run}`);
    tokens.customer = await login(`cust-${run}`);
    tokens.unlinked = await login(`unlinked-${run}`);

    modelId = (await http().post('/api/v1/device-models').set(as('admin')).send({ brand: 'E2E', model: `Cobertura ${run}` }).expect(201)).body.id;
    otherModelId = (await http().post('/api/v1/device-models').set(as('admin')).send({ brand: 'E2E', model: `Otro ${run}` }).expect(201)).body.id;
  });

  afterAll(async () => app.close());

  describe('Reception', () => {
    it('leaves no customer behind when the intake is rejected [003/RF-2.2]', async () => {
      await http().post('/api/v1/work-orders').set(as('recep')).send(intake(1, `E2E-${run}`)).expect(201);
      const newcomer = `E2E-ATOM-${run}`;

      const clash = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(1, newcomer, otherModelId)).expect(409);

      expect(clash.body.message).toContain('otro modelo');
      expect(await prisma.customer.findUnique({ where: { identification: newcomer } })).toBeNull();
    });

    it('takes the receptionist from the session and refuses it in the body [003/RF-2.3]', async () => {
      const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(2, `E2E-${run}`)).expect(201);
      expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: created.body.id } })).receptionistId).toBe(recepId);

      const forged = await http()
        .post('/api/v1/work-orders')
        .set(as('recep'))
        .send({ ...intake(3, `E2E-${run}`), receptionistId: randomUUID() })
        .expect(400);
      expect(forged.body.message).toContain('El campo «receptionistId» no está permitido');
    });

    it('moves a resold device to its new owner and keeps its history [003/RF-6.3]', async () => {
      const first = `E2E-OWNER1-${run}`;
      const second = `E2E-OWNER2-${run}`;
      await http().post('/api/v1/work-orders').set(as('recep')).send(intake(4, first)).expect(201);
      await http().post('/api/v1/work-orders').set(as('recep')).send(intake(4, second)).expect(201);

      const history = await http().get(`/api/v1/devices/by-imei/${imei(4)}`).set(as('recep')).expect(200);

      expect(history.body.customerName).toBe(`Cliente ${second}`);
      expect(history.body.repairs).toHaveLength(2);
    });
  });

  describe('Append-only tables', () => {
    it('refuses UPDATE and DELETE on the unlock code access log [004/RF-9.4]', async () => {
      const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(5, `E2E-${run}`)).expect(201);
      const id = created.body.id as string;
      await http().post(`/api/v1/work-orders/${id}/assign-technician`).set(as('recep')).send({ technicianId: techId }).expect(200);
      await http().post(`/api/v1/work-orders/${id}/unlock-code/reveal`).set(as('tech')).expect(200);

      await expect(prisma.$executeRaw`UPDATE unlock_code_access_logs SET user_id = user_id WHERE work_order_id = ${id}::uuid`).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRaw`DELETE FROM unlock_code_access_logs WHERE work_order_id = ${id}::uuid`).rejects.toThrow(/append-only/);
    });

    it('keeps available = physical - reserved and never negative, even against a raw write [007/RF-4.1]', async () => {
      const part = await http()
        .post('/api/v1/spare-parts')
        .set(as('admin'))
        .send({ sku: `INVAR-${run.toUpperCase()}`, name: 'Pieza invariante', category: 'IC', unitCost: '5.00', workshopPrice: '9.00', minStock: 1 })
        .expect(201);
      await http().post(`/api/v1/spare-parts/${part.body.id}/stock-entries`).set(as('admin')).send({ quantity: 2 }).expect(201);

      await expect(prisma.$executeRaw`UPDATE spare_parts SET available_stock = -1 WHERE id = ${part.body.id}::uuid`).rejects.toThrow(/spare_parts_stock_non_negative/);
      await expect(prisma.$executeRaw`UPDATE spare_parts SET reserved_stock = 5 WHERE id = ${part.body.id}::uuid`).rejects.toThrow(/spare_parts_stock_non_negative/);
      const row = await prisma.sparePart.findUniqueOrThrow({ where: { id: part.body.id } });
      expect(row.availableStock).toBe(row.physicalStock - row.reservedStock);
    });

    it('refuses UPDATE and DELETE on the stock ledger [007/RF-7.2]', async () => {
      const part = await http()
        .post('/api/v1/spare-parts')
        .set(as('admin'))
        .send({ sku: `LEDGER-${run.toUpperCase()}`, name: 'Pieza kardex', category: 'BATTERY', unitCost: '10.00', workshopPrice: '20.00', minStock: 1 })
        .expect(201);
      await http().post(`/api/v1/spare-parts/${part.body.id}/stock-entries`).set(as('admin')).send({ quantity: 3 }).expect(201);

      await expect(prisma.$executeRaw`UPDATE stock_movements SET quantity = 99 WHERE spare_part_id = ${part.body.id}::uuid`).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRaw`DELETE FROM stock_movements WHERE spare_part_id = ${part.body.id}::uuid`).rejects.toThrow(/append-only/);
    });
  });

  describe('Accounts and listings', () => {
    it('ends the previous sessions of an account when an admin resets its password [002/RF-4.2]', async () => {
      const username = `reset-${run}`;
      const oldPassword = 'Anterior2026Clave';
      await http().post('/api/v1/users').set(as('admin')).send({ username, password: oldPassword, fullName: 'Cuenta Reinicio', role: 'RECEPTIONIST' }).expect(201);
      const before = await http().post('/api/v1/auth/login').send({ username, password: oldPassword }).expect(200);
      const created = await prisma.user.findUniqueOrThrow({ where: { username } });
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await http().post(`/api/v1/users/${created.id}/password`).set(as('admin')).send({ password: 'Nueva2026Clave' }).expect(204);

      await http().post('/api/v1/auth/refresh').send({ refreshToken: before.body.refreshToken }).expect(401);
      await http().post('/api/v1/auth/login').send({ username, password: oldPassword }).expect(401);
      await http().post('/api/v1/auth/login').send({ username, password: 'Nueva2026Clave' }).expect(200);
    });

    it('answers a page beyond the last one with an empty list and the real total [005/RF-1.1]', async () => {
      const page = await http().get('/api/v1/work-orders?page=999&pageSize=20').set(as('recep')).expect(200);

      expect(page.body.data).toEqual([]);
      expect(page.body).toMatchObject({ page: 999, pageSize: 20 });
      expect(page.body.total).toBeGreaterThan(0);
    });
  });

  describe('Roles', () => {
    it('keeps the dashboard summary away from technicians and customers [005/RF-4.4]', async () => {
      await http().get('/api/v1/work-orders/summary').set(as('tech')).expect(403);
      await http().get('/api/v1/work-orders/summary').set(as('customer')).expect(403);
      const summary = await http().get('/api/v1/work-orders/summary').set(as('recep')).expect(200);
      expect(summary.body.byStatus).toHaveLength(9);
    });

    it('rejects a customer account that is not linked to a customer [008/RF-7.2]', async () => {
      const response = await http().get('/api/v1/work-orders/mine').set(as('unlinked')).expect(403);
      expect(response.body.message).toContain('no está vinculada');
    });

    it('shows a customer exactly the fields of the spec and nothing internal [008/RF-5.2]', async () => {
      const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(6, `E2E-${run}`)).expect(201);
      const mine = await http().get('/api/v1/work-orders/mine').set(as('customer')).expect(200);
      const view = (mine.body as Array<Record<string, unknown>>).find((order) => order.id === created.body.id);
      expect(Object.keys(view ?? {}).sort()).toEqual(['budgetTotal', 'device', 'id', 'number', 'promisedAt', 'status', 'statusLabel', 'updatedAt']);
    });
  });

  describe('Budgets', () => {
    it('cancels the order with the reason when the customer rejects [006/RF-6.1]', async () => {
      const { orderId, budgetId } = await budgetedOrder(7);

      await http().post(`/api/v1/budgets/${budgetId}/reject`).set(as('recep')).send({ channel: 'PHONE', reason: 'Muy caro' }).expect(200);

      expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('CANCELLED');
      const audit = await http().get(`/api/v1/work-orders/${orderId}/audit`).set(as('recep')).expect(200);
      expect(audit.body.at(-1)).toMatchObject({ newStatus: 'CANCELLED', reason: 'Presupuesto rechazado: Muy caro' });
    });

    it('marks the older version as superseded and numbers the new one [006/RF-3.1] [006/RF-3.2]', async () => {
      const { orderId, budgetId } = await budgetedOrder(8);
      const second = await http()
        .post(`/api/v1/work-orders/${orderId}/budgets`)
        .set(as('recep'))
        .send({ items: [{ itemType: 'LABOR', description: 'Cambio de flex', quantity: 1, unitPrice: '90.00' }] })
        .expect(201);
      await http().post(`/api/v1/budgets/${second.body.id}/send`).set(as('recep')).expect(200);

      expect(second.body.version).toBe(2);
      expect((await prisma.budget.findUniqueOrThrow({ where: { id: budgetId } })).status).toBe('SUPERSEDED');
      expect(await prisma.budget.count({ where: { workOrderId: orderId } })).toBe(2);
    });

    it('does not expose the unit cost in a budget with spare parts [006/RF-8.2]', async () => {
      const part = await http()
        .post('/api/v1/spare-parts')
        .set(as('admin'))
        .send({
          sku: `COSTO-${run.toUpperCase()}`,
          name: 'Pieza con costo',
          category: 'CAMERA_MODULE',
          unitCost: '123.00',
          workshopPrice: '200.00',
          minStock: 1,
          compatibleDeviceModelIds: [modelId],
        })
        .expect(201);
      const { orderId } = await budgetedOrder(9);
      const draft = await http()
        .post(`/api/v1/work-orders/${orderId}/budgets`)
        .set(as('recep'))
        .send({ items: [{ itemType: 'PART', description: 'Cámara', sparePartId: part.body.id, quantity: 1 }] })
        .expect(201);
      expect(JSON.stringify(draft.body)).not.toContain('unitCost');
      expect(JSON.stringify(draft.body)).not.toContain('123.00');
    });
  });
});
