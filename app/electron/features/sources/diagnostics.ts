import type {
  DiagnosticLevel,
  DiagnosticValue,
} from '../../../core/diagnostics/diagnostic-record.js';
import type { DiagnosticRecorder } from '../../../core/diagnostics/recorder.js';

/** Values only: never cookies, tokens, query strings or page URLs. */
export interface SourcesDiagnostics {
  event(
    event: string,
    detail?: Record<string, DiagnosticValue | undefined>,
    options?: { level?: DiagnosticLevel; code?: string; message?: string },
  ): void;
}

export function sourcesDiagnostics(recorder: DiagnosticRecorder | undefined): SourcesDiagnostics {
  return {
    event(event, detail, options = {}) {
      const fields: Record<string, DiagnosticValue> = {};
      for (const [key, value] of Object.entries(detail ?? {})) {
        if (value !== undefined) fields[key] = value;
      }
      recorder?.record({
        level: options.level ?? 'info',
        source: { process: 'main', module: 'sources' },
        event: `sources.${event}`,
        ...(options.code ? { code: options.code } : {}),
        ...(options.message ? { message: options.message } : {}),
        ...(Object.keys(fields).length ? { detail: fields } : {}),
      });
    },
  };
}

interface DownloadItemLike {
  awemeId: string;
  state: string;
  code?: string;
  stage?: string;
}

/** One record per item state change, diffed against the previous snapshot. */
export function recordDouyinDownloadTransitions(
  diagnostics: SourcesDiagnostics,
  previous: { items: readonly DownloadItemLike[] } | null,
  next: { items: readonly DownloadItemLike[] },
): void {
  const before = new Map(previous?.items.map((item) => [item.awemeId, item.state]) ?? []);
  for (const item of next.items) {
    const was = before.get(item.awemeId);
    if (was === item.state || (was === undefined && item.state === 'queued')) continue;
    const failed = item.state === 'failed';
    diagnostics.event(
      'download.item',
      { id: item.awemeId, state: item.state, from: was, stage: item.stage },
      {
        level: failed ? 'warn' : item.state === 'running' ? 'debug' : 'info',
        ...(failed && item.code ? { code: item.code } : {}),
      },
    );
  }
}
