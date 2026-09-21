import type {
  DiagnosticLevel,
  DiagnosticValue,
} from '../../../core/diagnostics/diagnostic-record.js';
import type { DiagnosticRecorder } from '../../../core/diagnostics/recorder.js';

/**
 * The Douyin intake path's own way of writing a Diagnostic record (D-61). Every event from this
 * feature is a `sources.*` record from the `sources` module, so binding that envelope once keeps
 * ~50 call sites to the part that differs: the event, its level and its value-only fields.
 *
 * It carries values only — paths, kinds, counts, booleans — never a cookie, token, query string
 * or page URL, exactly as the ad-hoc writer it replaced did. The sink still redacts.
 */
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

/**
 * One record per item state change in a download run. The run re-sends its whole snapshot on
 * every transition, so this diffs against the previous one: a failed item is recorded once, as a
 * warning carrying its code and the stage it stopped at, and a repeated snapshot adds nothing.
 */
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
