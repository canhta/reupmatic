export function object(
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  ) {
    throw new Error('INVALID_REQUEST');
  }
  return value as Record<string, unknown>;
}

export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value))
    throw new Error('INVALID_REQUEST');
  return value;
}

export function text(value: unknown, max: number, allowEmpty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    value.includes('\0') ||
    (!allowEmpty && !value.trim())
  )
    throw new Error('INVALID_REQUEST');
  return value;
}

export function revision(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error('INVALID_REQUEST');
  return Number(value);
}

export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('INVALID_REQUEST');
  return value;
}

export function identifiers(value: unknown, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('INVALID_REQUEST');
  const ids = value.map(identifier);
  if (new Set(ids).size !== ids.length) throw new Error('INVALID_REQUEST');
  return ids;
}

export function httpsUrl(value: unknown, allowEmpty = false): string {
  const raw = text(value, 4096, allowEmpty);
  if (allowEmpty && raw === '') return raw;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname ||
      // biome-ignore lint/suspicious/noControlCharactersInRegex: rejects control characters in URLs on purpose
      /[\s\u0000-\u001f\u007f]/.test(raw)
    )
      throw new Error();
  } catch {
    throw new Error('INVALID_URL');
  }
  return raw;
}
