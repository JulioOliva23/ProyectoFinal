import { randomInt } from 'node:crypto';

// SUP-05: public tracking code printed on the intake ticket. 8 characters
// from a 31-symbol alphabet without look-alikes (no 0/O, 1/I/L), ~8.5e11
// combinations. Shown as "ABCD-EFGH"; accepted with or without the dash.
export const TRACKING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TRACKING_CODE_LENGTH = 8;
export const TRACKING_CODE_PATTERN = new RegExp(`^[${TRACKING_CODE_ALPHABET}]{${TRACKING_CODE_LENGTH}}$`);

export function generateTrackingCode(random: (max: number) => number = randomInt): string {
  let code = '';
  for (let index = 0; index < TRACKING_CODE_LENGTH; index += 1) {
    code += TRACKING_CODE_ALPHABET[random(TRACKING_CODE_ALPHABET.length)];
  }
  return code;
}

// RN-03: the tracking code must never coincide with the device unlock code.
export function generateTrackingCodeDistinctFrom(unlockCode: string | undefined, random?: (max: number) => number): string {
  const forbidden = unlockCode ? normalizeTrackingCode(unlockCode) : undefined;
  let code = generateTrackingCode(random);
  while (code === forbidden) code = generateTrackingCode(random);
  return code;
}

export function normalizeTrackingCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function formatTrackingCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Accepts "OT-000123", "000123" or "123".
export function parseWorkOrderNumber(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  const digits = raw.trim().toUpperCase().replace(/^OT-?/, '');
  return /^\d{1,10}$/.test(digits) ? Number(digits) : Number.NaN;
}
