export function requestRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

export function requestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value))
    throw new Error('INVALID_REQUEST');
  return value;
}

export function requestRevision(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 2 ** 31 - 1) {
    throw new Error('INVALID_REQUEST');
  }
  return Number(value);
}
