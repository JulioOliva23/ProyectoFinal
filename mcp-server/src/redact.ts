// Defense in depth for what reaches the model's context: the API already
// filters by role (RN-03, RN-07), but if a field like these ever slips into a
// response it is masked here before the agent sees it.
const SENSITIVE_KEY = /unlock|password|token|secret|cipher|hash|unitcost/i;

export const REDACTED = '[REDACTADO]';

export function redactSensitive<T>(value: T): T {
  return redact(value) as T;
}

// Flags such as hasUnlockCode say whether a secret exists, not what it is.
function isSecret(key: string, value: unknown): boolean {
  return SENSITIVE_KEY.test(key) && typeof value !== 'boolean' && value !== null;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, isSecret(key, inner) ? REDACTED : redact(inner)]),
  );
}
