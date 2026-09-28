import {
  type DiagnosticCorrelation,
  type DiagnosticLevel,
  type DiagnosticValue,
  validateDiagnosticRecord,
} from '../../diagnostics/diagnostic-record.js';
import { operation } from '../operation-contract.js';
import { requestRecord } from '../validators.js';

// Host stamps the process; a renderer payload can never claim another process.
export interface RendererDiagnosticEntry {
  level: DiagnosticLevel;
  module: string;
  event: string;
  message?: string;
  code?: string;
  correlation?: DiagnosticCorrelation;
  detail?: Record<string, DiagnosticValue>;
}

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
  // Nothing leaves the machine on its own; both run only on an explicit user action.
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
