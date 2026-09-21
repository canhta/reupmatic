import type { BatchSnapshot } from '../batch/batch-contracts.js';
import type { FolderSnapshot } from '../folders/folder-contracts.js';
import type { OriginalImportProgress } from '../library/library-contracts.js';
import type { DouyinDownloadSnapshot } from '../sources/douyin-download.js';
import type { ModelInstallEvent } from '../speech/model-catalogue.js';
import type { SpeechEvent } from '../speech/recognition.js';
import type { SynthesisEvent } from '../speech/synthesis/contracts.js';
import type { TranslationEvent } from '../speech/translation/contracts.js';
import type { VisionResult } from '../vision/vision.js';

/** One host-initiated push channel with no reply, e.g. a queue snapshot or a job progress tick. */
export interface EventEntry<TPayload, TMethod extends string> {
  readonly rendererMethod: TMethod;
  /** Never assigned; carries `TPayload` at the type level for `EventPayload`. */
  readonly __payload?: TPayload;
}

// Curried for the same reason as `operation()`: keeps `TMethod` inferred as a literal while
// `TPayload` is given explicitly.
export function event<TPayload>() {
  return <TMethod extends string>(entry: {
    rendererMethod: TMethod;
  }): EventEntry<TPayload, TMethod> => entry;
}

export type VisionJobEvent = { id: string; revision: number } & (
  | { event: 'progress'; data: { phase: string; fraction: number | null } }
  | { event: 'result'; data: VisionResult }
  | { event: 'error'; data: { code: string } }
);

// The render worker's progress/result payload is a raw, loosely-typed envelope
// (see core/worker/worker-client.ts Envelope); callers narrow individual fields.
export type RenderJobEvent = { id: string; revision: number } & (
  | { event: 'progress'; data: Record<string, unknown> }
  | { event: 'result'; data: { artifact_id: string; url: string } & Record<string, unknown> }
  | { event: 'error'; data: { code: string } }
);

/**
 * `menu-command`'s payload is intentionally weak here: `MenuCommandId`/`WorkspaceArea` are
 * renderer-only vocabulary (`app/ui/shell/`) that the host never imports and sends as plain
 * strings by convention. `app/ui/host-window.d.ts` narrows this one event's callback type using
 * those UI types; `app/core` stays free of any UI import. `data` is an opaque per-command extra
 * (e.g. which Recent entry to reopen) the handler that registered for that command id parses.
 */
export type MenuCommandEvent = { command: string; area?: string; data?: unknown };

export const events = {
  batch: event<BatchSnapshot>()({ rendererMethod: 'onBatch' }),
  'catalog-changed': event<void>()({ rendererMethod: 'onCatalogChanged' }),
  folders: event<FolderSnapshot>()({ rendererMethod: 'onFolders' }),
  job: event<RenderJobEvent>()({ rendererMethod: 'onJob' }),
  'library-changed': event<void>()({ rendererMethod: 'onLibraryChanged' }),
  'library-import': event<OriginalImportProgress>()({ rendererMethod: 'onLibraryImport' }),
  // One whole-run snapshot on every download transition. The renderer keeps the latest so a
  // finished candidate stays on its row, and the status bar's one aggregate reads the same data
  // instead of a second queue (ticket 06, IA study).
  'douyin-download': event<DouyinDownloadSnapshot>()({ rendererMethod: 'onDouyinDownload' }),
  'menu-command': event<MenuCommandEvent>()({ rendererMethod: 'onMenuCommand' }),
  // The packaged app downloaded an update and will install it on the next quit; the renderer
  // raises one notification offering to restart now (D-64).
  'update-downloaded': event<{ version: string }>()({ rendererMethod: 'onUpdateDownloaded' }),
  'models-changed': event<void>()({ rendererMethod: 'onModelsChanged' }),
  'recent-changed': event<void>()({ rendererMethod: 'onRecentChanged' }),
  'recovery-flush': event<{ request_id: string }>()({ rendererMethod: 'onRecoveryFlush' }),
  'vision-job': event<VisionJobEvent>()({ rendererMethod: 'onVisionJob' }),
  'speech-job': event<SpeechEvent>()({ rendererMethod: 'onSpeechJob' }),
  'speech-model-install': event<ModelInstallEvent>()({
    rendererMethod: 'onSpeechModelInstall',
  }),
  'speech-models-changed': event<void>()({ rendererMethod: 'onSpeechModelsChanged' }),
  'translation-job': event<TranslationEvent>()({ rendererMethod: 'onTranslationJob' }),
  'translation-models-changed': event<void>()({
    rendererMethod: 'onTranslationModelsChanged',
  }),
  'synthesis-job': event<SynthesisEvent>()({ rendererMethod: 'onSynthesisJob' }),
  'synthesis-models-changed': event<void>()({ rendererMethod: 'onSynthesisModelsChanged' }),
} as const;

export type EventName = keyof typeof events;
export type EventPayload<K extends EventName> = NonNullable<(typeof events)[K]['__payload']>;

type EventMethod<E> =
  E extends EventEntry<infer Payload, string>
    ? (callback: (data: Payload) => void) => () => void
    : never;

export type HostEventMethods = {
  [K in EventName as (typeof events)[K]['rendererMethod']]: EventMethod<(typeof events)[K]>;
};
