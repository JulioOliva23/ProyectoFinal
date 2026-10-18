import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeviceCheckInDto } from '../src/modules/devices/dto/device-check-in.dto';
import { CreateWorkOrderDto } from '../src/modules/work-orders/dto/create-work-order.dto';

const MODEL_ID = '0b9a2d6e-0000-4000-8000-000000000001';

function validIntake(overrides: Record<string, unknown> = {}) {
  return {
    customer: { identification: '8456123 LP', name: 'María Quispe' },
    device: { imei: '352099001761481', deviceModelId: MODEL_ID },
    reportedProblem: 'Pantalla rota',
    batteryLevel: 40,
    cosmeticCheckIn: { screen: 'CRACKED', backCover: 'OK', frame: 'SCRATCHED', cameraLens: 'OK', buttons: 'OK' },
    lockType: 'PIN',
    unlockCode: '4821',
    ...overrides,
  };
}

async function errorsOf<T extends object>(cls: new () => T, plain: object) {
  return validate(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true });
}

describe('DeviceCheckInDto — Luhn wired into the DTO (RN-02)', () => {
  it('normalizes a formatted IMEI and accepts it', async () => {
    const dto = plainToInstance(DeviceCheckInDto, { imei: '35-209900-176148-1', deviceModelId: MODEL_ID });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.imei).toBe('352099001761481');
  });

  it('rejects an IMEI with a wrong check digit', async () => {
    const errors = await errorsOf(DeviceCheckInDto, { imei: '352099001761482', deviceModelId: MODEL_ID });
    expect(errors[0].constraints).toHaveProperty('isImei');
  });

  it.each(['12345', 'ABCDEFGHIJKLMNO', '3520990017614811'])('rejects malformed IMEI %p', async (imei) => {
    const errors = await errorsOf(DeviceCheckInDto, { imei, deviceModelId: MODEL_ID });
    expect(errors.map((error) => error.property)).toContain('imei');
  });
});

describe('CreateWorkOrderDto (RN-01, RN-03)', () => {
  it('accepts a complete intake', async () => {
    expect(await errorsOf(CreateWorkOrderDto, validIntake())).toHaveLength(0);
  });

  it('propagates the nested IMEI Luhn error', async () => {
    const errors = await errorsOf(CreateWorkOrderDto, validIntake({ device: { imei: '490154203237519', deviceModelId: MODEL_ID } }));
    expect(errors.find((error) => error.property === 'device')?.children?.[0].constraints).toHaveProperty('isImei');
  });

  it.each([
    ['PIN', '12'],
    ['PIN', '12ab'],
    ['PATTERN', '1-2'],
    ['PATTERN', '0-1-2-3'],
    ['NONE', '1234'],
  ])('rejects lockType %s with unlockCode %p', async (lockType, unlockCode) => {
    const errors = await errorsOf(CreateWorkOrderDto, validIntake({ lockType, unlockCode }));
    expect(errors.map((error) => error.property)).toContain('unlockCode');
  });

  it('requires an unlock code for protected devices', async () => {
    const errors = await errorsOf(CreateWorkOrderDto, validIntake({ lockType: 'PATTERN', unlockCode: undefined }));
    expect(errors.map((error) => error.property)).toContain('unlockCode');
  });

  it('accepts a pattern and a device without lock', async () => {
    expect(await errorsOf(CreateWorkOrderDto, validIntake({ lockType: 'PATTERN', unlockCode: '1-5-9-6' }))).toHaveLength(0);
    expect(await errorsOf(CreateWorkOrderDto, validIntake({ lockType: 'NONE', unlockCode: undefined }))).toHaveLength(0);
  });

  it('rejects battery outside 0-100 and unknown cosmetic values', async () => {
    const errors = await errorsOf(
      CreateWorkOrderDto,
      validIntake({ batteryLevel: 120, cosmeticCheckIn: { screen: 'BROKEN', backCover: 'OK', frame: 'OK', cameraLens: 'OK', buttons: 'OK' } }),
    );
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['batteryLevel', 'cosmeticCheckIn']));
  });

  it('rejects unexpected fields (forbidNonWhitelisted)', async () => {
    const errors = await errorsOf(CreateWorkOrderDto, validIntake({ status: 'DELIVERED' }));
    expect(errors.map((error) => error.property)).toContain('status');
  });
});
