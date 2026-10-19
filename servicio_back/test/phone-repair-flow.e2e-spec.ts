import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Full lifecycle over the real AppModule + PostgreSQL: RBAC, IMEI Luhn,
// budget approval, Stock Guard (incl. a race for the last unit), audit trail
// immutability and the customer view.
describe('Phone repair flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = randomUUID().slice(0, 8);
  const password = `E2e-${randomUUID()}`;
  const tokens: Record<'admin' | 'recep' | 'tech' | 'tech2' | 'customer', string> = {
    admin: '',
    recep: '',
    tech: '',
    tech2: '',
    customer: '',
  };
  let techId: string;
  let modelId: string;
  let scarcePartId: string;
  let customerIdentification: string;

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });

  // Builds a Luhn-valid IMEI unique to this run.
  function imei(seed: number): string {
    const body = `35${run.replace(/\D/g, '').padEnd(6, '7').slice(0, 6)}${String(seed).padStart(6, '0')}`;
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

  function intake(seed: number, overrides: Record<string, unknown> = {}) {
    return {
      customer: { identification: customerIdentification, name: 'Cliente E2E' },
      device: { imei: imei(seed), deviceModelId: modelId },
      reportedProblem: 'Pantalla no enciende',
      batteryLevel: 35,
      cosmeticCheckIn: { screen: 'CRACKED', backCover: 'OK', frame: 'SCRATCHED', cameraLens: 'OK', buttons: 'OK' },
      lockType: 'PIN',
      unlockCode: '4821',
      ...overrides,
    };
  }

  async function login(username: string): Promise<string> {
    const response = await http().post('/api/v1/auth/login').send({ username, password }).expect(200);
    return response.body.accessToken as string;
  }

  // RECEIVED → … → APPROVED with one scarce part line.
  async function approvedOrder(seed: number): Promise<string> {
    const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(seed)).expect(201);
    const id = created.body.id as string;
    await http().post(`/api/v1/work-orders/${id}/assign-technician`).set(as('recep')).send({ technicianId: techId }).expect(200);
    await http().post(`/api/v1/work-orders/${id}/transitions`).set(as('tech')).send({ to: 'IN_DIAGNOSIS' }).expect(200);
    const budget = await http()
      .post(`/api/v1/work-orders/${id}/budgets`)
      .set(as('recep'))
      .send({
        items: [
          { itemType: 'LABOR', description: 'Cambio de pantalla', quantity: 1, unitPrice: '120.00' },
          { itemType: 'PART', description: 'OLED', sparePartId: scarcePartId, quantity: 1 },
        ],
      })
      .expect(201);
    await http().post(`/api/v1/budgets/${budget.body.id}/send`).set(as('recep')).expect(200);
    await http().post(`/api/v1/budgets/${budget.body.id}/approve`).set(as('recep')).send({ channel: 'WHATSAPP' }).expect(200);
    return id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);

    customerIdentification = `E2E-${run}`;
    const customer = await prisma.customer.create({ data: { identification: customerIdentification, name: 'Cliente E2E' } });
    const passwordHash = await argon2.hash(password);
    const make = (suffix: string, role: string, customerId?: string) =>
      prisma.user.create({ data: { username: `${suffix}-${run}`, passwordHash, fullName: `${role} ${run}`, role, customerId } });
    await make('admin', 'ADMIN');
    await make('recep', 'RECEPTIONIST');
    techId = (await make('tech', 'TECHNICIAN')).id;
    await make('tech2', 'TECHNICIAN');
    await make('cust', 'CUSTOMER', customer.id);

    tokens.admin = await login(`admin-${run}`);
    tokens.recep = await login(`recep-${run}`);
    tokens.tech = await login(`tech-${run}`);
    tokens.tech2 = await login(`tech2-${run}`);
    tokens.customer = await login(`cust-${run}`);

    modelId = (await http().post('/api/v1/device-models').set(as('admin')).send({ brand: 'E2E', model: `Phone ${run}` }).expect(201)).body.id;
    const part = await http()
      .post('/api/v1/spare-parts')
      .set(as('admin'))
      .send({
        sku: `OLED-E2E-${run.toUpperCase()}`,
        name: 'OLED E2E',
        category: 'DISPLAY_OLED',
        unitCost: '500.00',
        workshopPrice: '800.00',
        minStock: 1,
        compatibleDeviceModelIds: [modelId],
      })
      .expect(201);
    scarcePartId = part.body.id;
    // Exactly ONE unit: two orders will compete for it.
    await http().post(`/api/v1/spare-parts/${scarcePartId}/stock-entries`).set(as('admin')).send({ quantity: 1 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Auth & RBAC', () => {
    it('rejects unauthenticated requests', async () => {
      await http().get('/api/v1/work-orders').expect(401);
    });

    it('forbids a technician from creating spare parts', async () => {
      await http().post('/api/v1/spare-parts').set(as('tech')).send({}).expect(403);
    });

    it('hides prices from technicians (RN-07)', async () => {
      const response = await http().get(`/api/v1/spare-parts/${scarcePartId}`).set(as('tech')).expect(200);
      expect(response.body).not.toHaveProperty('workshopPrice');
      expect(response.body).not.toHaveProperty('unitCost');
    });
  });

  describe('Device check-in (RN-02)', () => {
    it('rejects an IMEI that fails Luhn', async () => {
      const bad = imei(900).slice(0, 14) + String((Number(imei(900)[14]) + 1) % 10);
      const response = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(900, { device: { imei: bad, deviceModelId: modelId } })).expect(400);
      expect(JSON.stringify(response.body.message)).toContain('Luhn');
    });

    it('accepts a formatted IMEI and stores it normalized', async () => {
      const raw = imei(901);
      const formatted = `${raw.slice(0, 2)}-${raw.slice(2, 8)}-${raw.slice(8, 14)}-${raw.slice(14)}`;
      await http().post('/api/v1/work-orders').set(as('recep')).send(intake(901, { device: { imei: formatted, deviceModelId: modelId } })).expect(201);
      const history = await http().get(`/api/v1/devices/by-imei/${raw}`).set(as('recep')).expect(200);
      expect(history.body.imei).toBe(raw);
      expect(history.body.repairs).toHaveLength(1);
    });

    it('never stores or returns the unlock code in plaintext (RN-03)', async () => {
      const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(902)).expect(201);
      expect(JSON.stringify(created.body)).not.toContain('4821');
      const row = await prisma.workOrder.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.unlockCodeCipher).not.toContain('4821');
    });
  });

  describe('Lifecycle with Stock Guard and Audit Trail', () => {
    let winnerId: string;
    let loserId: string;

    it('requires a technician assignment before diagnosis', async () => {
      const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(903)).expect(201);
      await http().post(`/api/v1/work-orders/${created.body.id}/transitions`).set(as('admin')).send({ to: 'IN_DIAGNOSIS' }).expect(422);
    });

    it('cannot be APPROVED without a customer-approved budget (RN-05)', async () => {
      const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(904)).expect(201);
      const id = created.body.id as string;
      await http().post(`/api/v1/work-orders/${id}/assign-technician`).set(as('recep')).send({ technicianId: techId }).expect(200);
      await http().post(`/api/v1/work-orders/${id}/transitions`).set(as('tech')).send({ to: 'IN_DIAGNOSIS' }).expect(200);
      // Skipping the budget entirely is an illegal transition.
      await http().post(`/api/v1/work-orders/${id}/transitions`).set(as('admin')).send({ to: 'APPROVED' }).expect(409);
      // And BUDGETED requires a SENT budget.
      await http().post(`/api/v1/work-orders/${id}/transitions`).set(as('recep')).send({ to: 'BUDGETED' }).expect(422);
    });

    it('lets only one of two orders reserve the last unit (RN-09)', async () => {
      const first = await approvedOrder(905);
      const second = await approvedOrder(906);

      const results = await Promise.all(
        [first, second].map((id) => http().post(`/api/v1/work-orders/${id}/transitions`).set(as('tech')).send({ to: 'IN_REPAIR' })),
      );
      const statuses = results.map((response) => response.status).sort();
      expect(statuses).toEqual([200, 422]);

      winnerId = results[0].status === 200 ? first : second;
      loserId = winnerId === first ? second : first;
      const loser = results.find((response) => response.status === 422);
      expect(JSON.stringify(loser?.body)).toContain('insufficient stock');

      const part = await prisma.sparePart.findUniqueOrThrow({ where: { id: scarcePartId } });
      expect(part).toMatchObject({ physicalStock: 1, reservedStock: 1, availableStock: 0 });
      // Rolled back: the losing order is still APPROVED with its line PENDING.
      const loserRow = await prisma.workOrder.findUniqueOrThrow({ where: { id: loserId } });
      expect(loserRow.status).toBe('APPROVED');
    });

    it('consumes the reservation when entering quality control', async () => {
      await http().post(`/api/v1/work-orders/${winnerId}/transitions`).set(as('tech')).send({ to: 'QUALITY_CONTROL' }).expect(200);
      const part = await prisma.sparePart.findUniqueOrThrow({ where: { id: scarcePartId } });
      expect(part).toMatchObject({ physicalStock: 0, reservedStock: 0, availableStock: 0 });
      const kinds = await prisma.stockMovement.findMany({ where: { workOrderId: winnerId }, orderBy: { createdAt: 'asc' }, select: { type: true } });
      expect(kinds.map((movement) => movement.type)).toEqual(['RESERVE', 'OUT']);
    });

    it('shows the part as a low-stock alert (RN-11)', async () => {
      const alerts = await http().get('/api/v1/spare-parts/alerts/low-stock').set(as('recep')).expect(200);
      expect(alerts.body.map((part: { id: string }) => part.id)).toContain(scarcePartId);
    });

    it('rejects a technician that is not assigned (RN-06)', async () => {
      await http().post(`/api/v1/work-orders/${winnerId}/transitions`).set(as('tech2')).send({ to: 'READY_FOR_DELIVERY' }).expect(403);
    });

    it('delivers the device and writes one audit row per transition (RN-12)', async () => {
      await http().post(`/api/v1/work-orders/${winnerId}/transitions`).set(as('tech')).send({ to: 'READY_FOR_DELIVERY' }).expect(200);
      await http().post(`/api/v1/work-orders/${winnerId}/transitions`).set(as('recep')).send({ to: 'DELIVERED' }).expect(200);

      const audit = await http().get(`/api/v1/work-orders/${winnerId}/audit`).set(as('recep')).expect(200);
      expect(audit.body.map((entry: { newStatus: string }) => entry.newStatus)).toEqual([
        'IN_DIAGNOSIS',
        'BUDGETED',
        'APPROVED',
        'IN_REPAIR',
        'QUALITY_CONTROL',
        'READY_FOR_DELIVERY',
        'DELIVERED',
      ]);
      expect(audit.body[0]).toMatchObject({ previousStatus: 'RECEIVED', userId: techId });

      const loserAudit = await prisma.workOrderStatusAudit.findMany({ where: { workOrderId: loserId } });
      expect(loserAudit.map((entry) => entry.newStatus)).not.toContain('IN_REPAIR');
    });

    it('refuses UPDATE and DELETE on the audit table (DB trigger)', async () => {
      await expect(prisma.$executeRaw`UPDATE work_order_status_audits SET reason = 'tampered' WHERE work_order_id = ${winnerId}::uuid`).rejects.toThrow(
        /append-only/,
      );
      await expect(prisma.$executeRaw`DELETE FROM work_order_status_audits WHERE work_order_id = ${winnerId}::uuid`).rejects.toThrow(/append-only/);
    });

    it('treats DELIVERED as terminal', async () => {
      await http().post(`/api/v1/work-orders/${winnerId}/transitions`).set(as('admin')).send({ to: 'IN_REPAIR' }).expect(409);
    });
  });

  describe('Unlock code reveal (RN-03)', () => {
    it('reveals to the assigned technician only and logs the access', async () => {
      const id = await approvedOrder(907);
      await http().post(`/api/v1/work-orders/${id}/unlock-code/reveal`).set(as('tech2')).expect(403);
      const revealed = await http().post(`/api/v1/work-orders/${id}/unlock-code/reveal`).set(as('tech')).expect(200);
      expect(revealed.body).toEqual({ lockType: 'PIN', unlockCode: '4821' });
      expect(await prisma.unlockCodeAccessLog.count({ where: { workOrderId: id } })).toBe(1);
    });
  });

  describe('Budget expiration (RN-08)', () => {
    it('rejects approval of an expired budget', async () => {
      const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(908)).expect(201);
      const id = created.body.id as string;
      await http().post(`/api/v1/work-orders/${id}/assign-technician`).set(as('recep')).send({ technicianId: techId }).expect(200);
      await http().post(`/api/v1/work-orders/${id}/transitions`).set(as('tech')).send({ to: 'IN_DIAGNOSIS' }).expect(200);
      const budget = await http()
        .post(`/api/v1/work-orders/${id}/budgets`)
        .set(as('recep'))
        .send({ items: [{ itemType: 'LABOR', description: 'Diagnóstico placa', quantity: 1, unitPrice: '50.00' }] })
        .expect(201);
      await http().post(`/api/v1/budgets/${budget.body.id}/send`).set(as('recep')).expect(200);
      await prisma.budget.update({ where: { id: budget.body.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

      await http().post(`/api/v1/budgets/${budget.body.id}/approve`).set(as('recep')).send({ channel: 'PHONE' }).expect(422);
      expect((await prisma.budget.findUniqueOrThrow({ where: { id: budget.body.id } })).status).toBe('EXPIRED');
      expect((await prisma.workOrder.findUniqueOrThrow({ where: { id } })).status).toBe('BUDGETED');
    });

    it('does not let technicians read budgets (RN-07)', async () => {
      await http().get(`/api/v1/work-orders/${randomUUID()}/budgets`).set(as('tech')).expect(403);
    });
  });

  // SUP-05: second customer access mode. The public endpoint allows 5
  // requests/min per IP, so this block makes exactly 5 and the 6th must be
  // throttled. Keep the order and the count if you add cases here.
  describe('Public tracking by work order number + tracking code (SUP-05)', () => {
    let number: number;
    let trackingCode: string;
    let workOrderId: string;
    const track = (body: object) => http().post('/api/v1/public/tracking').send(body);

    beforeAll(async () => {
      const created = await http().post('/api/v1/work-orders').set(as('recep')).send(intake(909)).expect(201);
      ({ number, trackingCode, id: workOrderId } = created.body);
      expect(trackingCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(trackingCode.replace('-', '')).not.toBe('4821');
    });

    it('never stores the code in plaintext nor returns it again', async () => {
      const row = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } });
      expect(row.trackingCodeHash).toMatch(/^\$argon2/);
      const detail = await http().get(`/api/v1/work-orders/${workOrderId}`).set(as('recep')).expect(200);
      expect(JSON.stringify(detail.body)).not.toContain(trackingCode.replace('-', ''));
      expect(detail.body).not.toHaveProperty('trackingCodeHash');
    });

    it('returns only the customer status view, without a session (1/5)', async () => {
      const ticketNumber = `OT-${String(number).padStart(6, '0')}`;
      const response = await track({ number: ticketNumber, trackingCode: trackingCode.toLowerCase() }).expect(200);
      expect(Object.keys(response.body).sort()).toEqual(['budgetTotal', 'device', 'id', 'number', 'promisedAt', 'status', 'statusLabel', 'updatedAt']);
      expect(response.body).toMatchObject({ number, status: 'RECEIVED', statusLabel: 'Ingresado' });
    });

    it('gives the same 404 for a wrong code and an unknown number (2/5, 3/5)', async () => {
      const wrong = await track({ number, trackingCode: 'ZZZZ-ZZZZ' }).expect(404);
      const unknown = await track({ number: 2_000_000_000, trackingCode }).expect(404);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('invalidates the previous code when a new one is issued (4/5, 5/5)', async () => {
      await http().post(`/api/v1/work-orders/${workOrderId}/tracking-code/regenerate`).set(as('tech')).expect(403);
      const regenerated = await http().post(`/api/v1/work-orders/${workOrderId}/tracking-code/regenerate`).set(as('recep')).expect(200);
      await track({ number, trackingCode }).expect(404);
      await track({ number, trackingCode: regenerated.body.trackingCode }).expect(200);
      trackingCode = regenerated.body.trackingCode;
    });

    it('throttles the 6th attempt within a minute', async () => {
      await track({ number, trackingCode }).expect(429);
    });
  });

  describe('Customer view (RN-14)', () => {
    it('lists only status information for the customer', async () => {
      const response = await http().get('/api/v1/work-orders/mine').set(as('customer')).expect(200);
      expect(response.body.length).toBeGreaterThan(0);
      for (const order of response.body) {
        expect(Object.keys(order).sort()).toEqual(['budgetTotal', 'device', 'id', 'number', 'promisedAt', 'status', 'statusLabel', 'updatedAt']);
      }
      expect(response.body.map((order: { statusLabel: string }) => order.statusLabel)).toContain('Entregado');
    });

    it('blocks staff endpoints for customers', async () => {
      await http().get('/api/v1/work-orders').set(as('customer')).expect(403);
      await http().get('/api/v1/spare-parts').set(as('customer')).expect(403);
    });
  });
});
