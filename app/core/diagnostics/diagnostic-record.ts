export const DIAGNOSTIC_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type DiagnosticLevel = (typeof DIAGNOSTIC_LEVELS)[number];

export const DIAGNOSTIC_PROCESSES = ['main', 'core', 'renderer', 'worker'] as const;
export type DiagnosticProcess = (typeof DIAGNOSTIC_PROCESSES)[number];

export const CORRELATION_KEYS = ['job', 'workflow_run', 'batch', 'content', 'project'] as const;
export type CorrelationKey = (typeof CORRELATION_KEYS)[number];
export type DiagnosticCorrelation = Partial<Record<CorrelationKey, string>>;

export interface DiagnosticRecord {
  at: string;
  level: DiagnosticLevel;
  source: { process: DiagnosticProcess; module: string };
  event: string;
  message?: string;
  /** From the existing worker error-code vocabulary; diagnostics never extend it. */
  code?: string;
  correlation?: DiagnosticCorrelation;
  /** Value-only detail; redacted before any write. */
  detail?: Record<string, DiagnosticValue>;
}

export type DiagnosticValue = string | number | boolean | null;

export type DiagnosticEntry = Omit<DiagnosticRecord, 'at'> & { at?: string };

const EVENT = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const MODULE = /^[a-z][a-z0-9]*(?:[/-][a-z0-9]+)*$/;
const CODE = /^[A-Z][A-Z0-9_]*$/;
const MAX_TEXT = 2000;
const MAX_DETAIL_KEYS = 32;

function isValue(value: unknown): value is DiagnosticValue {
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.length <= MAX_TEXT;
}

function plainObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

// Untrusted input; a bad line is dropped, never corrupted.
export function validateDiagnosticRecord(input: unknown): DiagnosticRecord {
  const value = plainObject(input);
  if (!value) throw new Error('INVALID_DIAGNOSTIC');
  const at = typeof value.at === 'string' ? value.at : '';
  if (!at || Number.isNaN(Date.parse(at))) throw new Error('INVALID_DIAGNOSTIC');
  if (!DIAGNOSTIC_LEVELS.includes(value.level as DiagnosticLevel))
    throw new Error('INVALID_DIAGNOSTIC');
  const source = plainObject(value.source);
  if (
    !source ||
    !DIAGNOSTIC_PROCESSES.includes(source.process as DiagnosticProcess) ||
    typeof source.module !== 'string' ||
    !MODULE.test(source.module)
  )
    throw new Error('INVALID_DIAGNOSTIC');
  if (typeof value.event !== 'string' || !EVENT.test(value.event))
    throw new Error('INVALID_DIAGNOSTIC');

  const record: DiagnosticRecord = {
    at: new Date(at).toISOString(),
    level: value.level as DiagnosticLevel,
    source: { process: source.process as DiagnosticProcess, module: source.module },
    event: value.event,
  };
  if (value.message !== undefined) {
    if (typeof value.message !== 'string' || value.message.length > MAX_TEXT)
      throw new Error('INVALID_DIAGNOSTIC');
    record.message = value.message;
  }
  if (value.code !== undefined) {
    if (typeof value.code !== 'string' || !CODE.test(value.code))
      throw new Error('INVALID_DIAGNOSTIC');
    record.code = value.code;
  }
  if (value.correlation !== undefined) {
    const correlation = plainObject(value.correlation);
    if (!correlation) throw new Error('INVALID_DIAGNOSTIC');
    const narrowed: DiagnosticCorrelation = {};
    for (const [key, id] of Object.entries(correlation)) {
      if (!CORRELATION_KEYS.includes(key as CorrelationKey)) throw new Error('INVALID_DIAGNOSTIC');
      if (id === undefined) continue;
      if (typeof id !== 'string' || !id || id.length > 128) throw new Error('INVALID_DIAGNOSTIC');
      narrowed[key as CorrelationKey] = id;
    }
    if (Object.keys(narrowed).length) record.correlation = narrowed;
  }
  if (value.detail !== undefined) {
    const detail = plainObject(value.detail);
    if (!detail || Object.keys(detail).length > MAX_DETAIL_KEYS)
      throw new Error('INVALID_DIAGNOSTIC');
    const narrowed: Record<string, DiagnosticValue> = {};
    for (const [key, field] of Object.entries(detail)) {
      if (field === undefined) continue;
      if (!isValue(field)) throw new Error('INVALID_DIAGNOSTIC');
      narrowed[key] = field;
    }
    if (Object.keys(narrowed).length) record.detail = narrowed;
  }
  return record;
}

export function parseDiagnosticLine(line: string): DiagnosticRecord | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    return validateDiagnosticRecord(JSON.parse(trimmed));
  } catch {
    return undefined;
  }
}
