import type { ContentNumericRange } from './library-contracts.js';

export function requestEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('INVALID_REQUEST');
  if (value.length === 0) return undefined;
  if (value.length > 32) throw new Error('INVALID_REQUEST');
  for (const entry of value) {
    if (typeof entry !== 'string' || !allowed.includes(entry as T))
      throw new Error('INVALID_REQUEST');
  }
  return value as T[];
}

export function requestNumericRange(value: unknown): ContentNumericRange | undefined {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== 'min' && key !== 'max')
  )
    throw new Error('INVALID_REQUEST');
  const { min, max } = value as { min?: unknown; max?: unknown };
  if (min === undefined && max === undefined) throw new Error('INVALID_REQUEST');
  for (const bound of [min, max]) {
    if (bound !== undefined && (!Number.isSafeInteger(bound) || (bound as number) < 0))
      throw new Error('INVALID_REQUEST');
  }
  if (min !== undefined && max !== undefined && (min as number) > (max as number))
    throw new Error('INVALID_REQUEST');
  return {
    ...(min !== undefined ? { min: min as number } : {}),
    ...(max !== undefined ? { max: max as number } : {}),
  };
}

export function requestLabelIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) throw new Error('INVALID_REQUEST');
  if (value.length === 0) return undefined;
  if (value.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 128))
    throw new Error('INVALID_REQUEST');
  return value as string[];
}
