/**
 * The one current Diagnostic record shape (D-61). One JSON object per line in the Diagnostic
 * log; a future change replaces this shape and its reader together, so there is no versioned
 * reader, alias or migration path here.
 *
 * Correlation deliberately reuses existing domain identifiers — Job, Workflow
 * run, Batch, Content entry and (Editor contexts only) Project. No trace/session/span id is
 * invented.
 */

export const DIAGNOSTIC_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type DiagnosticLevel = (typeof DIAGNOSTIC_LEVELS)[number];

export const DIAGNOSTIC_PROCESSES = ['main', 'core', 'renderer', 'worker'] as const;
export type DiagnosticProcess = (typeof DIAGNOSTIC_PROCESSES)[number];

/** Which existing domain records this entry belongs to; every field is optional. */
export const CORRELATION_KEYS = ['job', 'workflow_run', 'batch', 'content', 'project'] as const;
export type CorrelationKey = (typeof CORRELATION_KEYS)[number];
export type DiagnosticCorrelation = Partial<Record<CorrelationKey, string>>;

export interface DiagnosticRecord {
  /** ISO-8601 UTC instant the record was stamped. */
  at: string;
  level: DiagnosticLevel;
  source: { process: DiagnosticProcess; module: string };
  /** A stable, greppable event name, e.g. `worker.job-failed`. */
  event: string;
  message?: string;
  /** From the existing worker error-code vocabulary; diagnostics never extend it. */
  code?: string;
  correlation?: DiagnosticCorrelation;
  /** Value-only detail: strings, numbers, booleans and null. Redacted before any write. */
  detail?: Record<string, DiagnosticValue>;
}

export type DiagnosticValue = string | number | boolean | null;

/** What a producer hands the sink; the sink stamps `at` and may re-stamp `source.process`. */
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

/**
 * Validates an untrusted record — a line off the worker's stderr, or a payload from the
 * renderer — and returns the narrowed record. Throws `INVALID_DIAGNOSTIC` otherwise; every
 * intake drops the offending line rather than letting it corrupt the stream.
 */
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

/** Parses one NDJSON line, returning `undefined` for a malformed or invalid record. */
export function parseDiagnosticLine(line: string): DiagnosticRecord | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    return validateDiagnosticRecord(JSON.parse(trimmed));
  } catch {
    return undefined;
  }
}
