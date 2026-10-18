import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';

// Idempotent demo data (upserts only, never deletes). Passwords come from
// SEED_PASSWORD / SEED_PASSWORD_<ROLE>; nothing is hardcoded (GEN-11).
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }) });

type SeedRole = 'ADMIN' | 'RECEPTIONIST' | 'TECHNICIAN' | 'CUSTOMER';

function passwordFor(role: SeedRole): string {
  const password = process.env[`SEED_PASSWORD_${role}`] || process.env.SEED_PASSWORD;
  if (!password) throw new Error(`Missing SEED_PASSWORD or SEED_PASSWORD_${role} in .env`);
  return password;
}

const MODELS = [
  { id: '0b9a2d6e-0000-4000-8000-000000000001', brand: 'Apple', model: 'iPhone 13' },
  { id: '0b9a2d6e-0000-4000-8000-000000000002', brand: 'Apple', model: 'iPhone 13 Pro' },
  { id: '0b9a2d6e-0000-4000-8000-000000000003', brand: 'Samsung', model: 'Galaxy A54' },
  { id: '0b9a2d6e-0000-4000-8000-000000000004', brand: 'Xiaomi', model: 'Redmi Note 12' },
];

const PARTS = [
  { sku: 'OLED-IP13', name: 'Pantalla OLED iPhone 13', category: 'DISPLAY_OLED', unitCost: '650.00', workshopPrice: '980.00', stock: 4, minStock: 2, models: [0] },
  { sku: 'BAT-IP13', name: 'Batería iPhone 13 / 13 Pro', category: 'BATTERY', unitCost: '180.00', workshopPrice: '320.00', stock: 6, minStock: 3, models: [0, 1] },
  { sku: 'FLEX-USBC-A54', name: 'Flex de carga USB-C Galaxy A54', category: 'CHARGING_FLEX', unitCost: '45.00', workshopPrice: '110.00', stock: 1, minStock: 2, models: [2] },
  { sku: 'LCD-RN12', name: 'Pantalla LCD Redmi Note 12', category: 'DISPLAY_LCD', unitCost: '210.00', workshopPrice: '390.00', stock: 3, minStock: 1, models: [3] },
  { sku: 'CAM-IP13P-MAIN', name: 'Módulo cámara principal iPhone 13 Pro', category: 'CAMERA_MODULE', unitCost: '520.00', workshopPrice: '850.00', stock: 0, minStock: 1, models: [1] },
  { sku: 'IC-TRISTAR-1610A3', name: 'IC de carga Tristar 1610A3', category: 'IC', unitCost: '35.00', workshopPrice: '90.00', stock: 10, minStock: 4, models: [0, 1] },
];

async function main(): Promise<void> {
  const customer = await prisma.customer.upsert({
    where: { identification: '8456123 LP' },
    create: { identification: '8456123 LP', name: 'María Quispe', phone: '+59171234567' },
    update: {},
  });

  const users = [
    { username: 'admin01', fullName: 'Administrador General', role: 'ADMIN' as const },
    { username: 'recep01', fullName: 'Recepción Uno', role: 'RECEPTIONIST' as const },
    { username: 'tecnico01', fullName: 'Técnico Uno', role: 'TECHNICIAN' as const },
    { username: 'tecnico02', fullName: 'Técnico Dos', role: 'TECHNICIAN' as const },
    { username: 'cliente01', fullName: 'María Quispe', role: 'CUSTOMER' as const, customerId: customer.id },
  ];
  for (const user of users) {
    const passwordHash = await argon2.hash(passwordFor(user.role));
    await prisma.user.upsert({ where: { username: user.username }, create: { ...user, passwordHash }, update: {} });
  }

  for (const model of MODELS) {
    await prisma.deviceModel.upsert({ where: { id: model.id }, create: model, update: {} });
  }

  for (const part of PARTS) {
    const { stock, models, ...data } = part;
    await prisma.sparePart.upsert({
      where: { sku: part.sku },
      create: {
        ...data,
        unitCost: new Prisma.Decimal(data.unitCost),
        workshopPrice: new Prisma.Decimal(data.workshopPrice),
        physicalStock: stock,
        availableStock: stock,
        compatibilities: { create: models.map((index) => ({ deviceModelId: MODELS[index].id })) },
      },
      update: {},
    });
  }
  console.info(`Seed OK: ${users.length} users, ${MODELS.length} device models, ${PARTS.length} spare parts`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
