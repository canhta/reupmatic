import type {
  DiagnosticLevel,
  DiagnosticValue,
} from '../../../core/diagnostics/diagnostic-record.js';
import type { DiagnosticRecorder } from '../../../core/diagnostics/recorder.js';

/** Values only: never access tokens, refresh tokens, Authorization headers or session URIs. */
export interface PublishingDiagnostics {
  event(
    event: string,
    detail?: Record<string, DiagnosticValue | undefined>,
    options?: { level?: DiagnosticLevel; code?: string; message?: string },
  ): void;
}

export function publishingDiagnostics(
  recorder: DiagnosticRecorder | undefined,
): PublishingDiagnostics {
  return {
    event(event, detail, options = {}) {
      const fields: Record<string, DiagnosticValue> = {};
      for (const [key, value] of Object.entries(detail ?? {})) {
        if (value !== undefined) fields[key] = value;
      }
      recorder?.record({
        level: options.level ?? 'info',
        source: { process: 'main', module: 'publishing' },
        event: `publishing.${event}`,
        ...(options.code ? { code: options.code } : {}),
        ...(options.message ? { message: options.message } : {}),
        ...(Object.keys(fields).length ? { detail: fields } : {}),
      });
    },
  };
}
