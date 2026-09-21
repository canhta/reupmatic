import {
  type DiagnosticCorrelation,
  type DiagnosticLevel,
  type DiagnosticValue,
  validateDiagnosticRecord,
} from '../../diagnostics/diagnostic-record.js';
import { operation } from '../operation-contract.js';
import { requestRecord } from '../validators.js';

/**
 * What the renderer sends: its own module and the record's fields, never the process. The host
 * stamps the process, so a renderer payload can never claim to have come from the worker or the
 * main process.
 */
export interface RendererDiagnosticEntry {
  level: DiagnosticLevel;
  module: string;
  event: string;
  message?: string;
  code?: string;
  correlation?: DiagnosticCorrelation;
  detail?: Record<string, DiagnosticValue>;
}

/**
 * The renderer's one way into the Diagnostic log (D-61): one entry in this canonical registry,
 * not a bespoke channel. Validation is the same `validateDiagnosticRecord` every other producer
 * is held to, so a renderer entry cannot carry a shape the log would not accept; redaction still
 * happens inside the sink.
 */
/** What an explicit support export wrote, so Settings can name the file it produced. */
export interface SupportBundle {
  path: string;
  records: number;
}

export const diagnosticsOperations = {
  'diagnostic-record': operation<RendererDiagnosticEntry, null>()({
    rendererMethod: 'recordDiagnostic',
    validate: (input): RendererDiagnosticEntry => {
      const value = requestRecord(input, [
        'level',
        'module',
        'event',
        'message',
        'code',
        'correlation',
        'detail',
      ]);
      const record = validateDiagnosticRecord({
        at: new Date().toISOString(),
        level: value.level,
        source: { process: 'renderer', module: value.module },
        event: value.event,
        message: value.message,
        code: value.code,
        correlation: value.correlation,
        detail: value.detail,
      });
      return {
        level: record.level,
        module: record.source.module,
        event: record.event,
        ...(record.message === undefined ? {} : { message: record.message }),
        ...(record.code === undefined ? {} : { code: record.code }),
        ...(record.correlation === undefined ? {} : { correlation: record.correlation }),
        ...(record.detail === undefined ? {} : { detail: record.detail }),
      };
    },
  }),
  // D-10: nothing leaves the machine on its own. Both of these run only on an explicit user
  // action in Settings → Advanced, and neither performs a network call.
  'diagnostics-open-folder': operation<undefined, null>()({
    rendererMethod: 'diagnosticsOpenFolder',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'diagnostics-export-bundle': operation<undefined, SupportBundle | null>()({
    rendererMethod: 'diagnosticsExportBundle',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
} as const;
