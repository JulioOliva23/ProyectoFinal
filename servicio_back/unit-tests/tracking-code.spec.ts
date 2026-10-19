import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  TRACKING_CODE_ALPHABET,
  TRACKING_CODE_PATTERN,
  formatTrackingCode,
  generateTrackingCode,
  generateTrackingCodeDistinctFrom,
  normalizeTrackingCode,
  parseWorkOrderNumber,
} from '../src/domain/work-orders/tracking-code';
import { PublicTrackingRequestDto } from '../src/modules/work-orders/dto/public-tracking.dto';

describe('Tracking code (SUP-05)', () => {
  it('generates 8 characters from an alphabet without look-alikes', () => {
    for (let i = 0; i < 200; i += 1) expect(generateTrackingCode()).toMatch(TRACKING_CODE_PATTERN);
    expect(TRACKING_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('is never equal to the device unlock code (RN-03)', () => {
    // A rigged random source first produces the unlock code itself.
    const sequence = [...'ABCDEFGH', ...'ABCDEFGH', ...'ZZZZZZZZ'].map((char) => TRACKING_CODE_ALPHABET.indexOf(char));
    let call = 0;
    const rigged = () => sequence[call++];
    expect(generateTrackingCodeDistinctFrom('abcd-efgh', rigged)).toBe('ZZZZZZZZ');
  });

  it('formats and normalizes the ticket representation', () => {
    expect(formatTrackingCode('K7QM3XPA')).toBe('K7QM-3XPA');
    expect(normalizeTrackingCode(' k7qm-3xpa ')).toBe('K7QM3XPA');
  });

  it.each([
    ['OT-000123', 123],
    ['ot000123', 123],
    ['000123', 123],
    [42, 42],
  ])('parses work order number %p', (raw, expected) => {
    expect(parseWorkOrderNumber(raw)).toBe(expected);
  });

  it('rejects non-numeric work order numbers', () => {
    expect(parseWorkOrderNumber('OT-12A')).toBeNaN();
  });
});

describe('PublicTrackingRequestDto (SUP-05)', () => {
  const errorsOf = (plain: object) => validate(plainToInstance(PublicTrackingRequestDto, plain), { forbidNonWhitelisted: true, whitelist: true });

  it('accepts the formats printed on the ticket', async () => {
    const dto = plainToInstance(PublicTrackingRequestDto, { number: 'OT-000123', trackingCode: 'k7qm-3xpa' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ number: 123, trackingCode: 'K7QM3XPA' });
  });

  it('rejects a 4-digit PIN-like code', async () => {
    const errors = await errorsOf({ number: 1, trackingCode: '4821' });
    expect(errors.map((error) => error.property)).toContain('trackingCode');
  });

  it('rejects malformed numbers and extra fields', async () => {
    const errors = await errorsOf({ number: 'OT-ABC', trackingCode: 'K7QM3XPA', imei: '352099001761481' });
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['number', 'imei']));
  });
});
