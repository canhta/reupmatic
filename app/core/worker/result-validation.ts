import { RemoteError } from './remote-error.js';

export function resultObject(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return data as Record<string, unknown>;
}

export function resultString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string') throw new RemoteError('INVALID_WORKER_RESPONSE');
  return value;
}

export function resultNumber(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return value;
}

export function resultBoolean(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  if (typeof value !== 'boolean') throw new RemoteError('INVALID_WORKER_RESPONSE');
  return value;
}

/** Baseline for results with richer request-aware validation in their owning domain. */
export function resultRecord(data: unknown): Record<string, unknown> {
  return resultObject(data);
}
