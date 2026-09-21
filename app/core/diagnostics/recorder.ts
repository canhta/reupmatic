import type { DiagnosticEntry } from './diagnostic-record.js';

/**
 * The narrow port a core module receives so it can leave evidence without importing Electron or
 * knowing where the Diagnostic log lives. The host sink implements it; a module that is handed
 * nothing simply records nothing.
 *
 * `record` never throws and never blocks on the caller's behalf: diagnostics must not be able to
 * take a feature down with them.
 */
export interface DiagnosticRecorder {
  record(entry: DiagnosticEntry): void;
}

/** Records to nowhere — for tests and for callers constructed before the sink exists. */
export const silentRecorder: DiagnosticRecorder = { record: () => undefined };
