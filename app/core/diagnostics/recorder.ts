import type { DiagnosticEntry } from './diagnostic-record.js';

/** The narrow port a core module receives to leave evidence; `record` never throws. */
export interface DiagnosticRecorder {
  record(entry: DiagnosticEntry): void;
}

/** Records to nowhere — for tests and for callers constructed before the sink exists. */
export const silentRecorder: DiagnosticRecorder = { record: () => undefined };
