import { Prisma } from '../../generated/prisma/client';

// RN-15: money is serialized as a fixed 2-decimal string, never a JS number.
export function money(value: Prisma.Decimal | null | undefined): string | null {
  return value == null ? null : value.toFixed(2);
}

export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
