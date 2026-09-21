import type { ProjectMedia } from '../../editing/project-media.js';
import type { AudioSource } from '../../editing/soundtrack.js';
import type { PublicVideo } from '../../media/media-contracts.js';
import type { EditorSnapshot } from '../../projects/project.js';
import type { RecentEntry } from '../../projects/recent.js';
import type { Cue } from '../../subtitles/cues.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

function requestPath(input: unknown): string {
  const value = requestRecord(input, ['path']);
  if (
    typeof value.path !== 'string' ||
    !value.path.trim() ||
    value.path.length > 4096 ||
    value.path.includes('\0')
  ) {
    throw new Error('INVALID_REQUEST');
  }
  return value.path;
}

type SaveResult = { saved: boolean; revision?: number; library_linked?: boolean; path?: string };

/** An opened project plus the file it came from, so the session can Save straight
 *  back to it. `project_path` is absent for a recovered draft (never written). */
export interface OpenedProject {
  media: PublicVideo;
  snapshot: EditorSnapshot;
  project_path?: string;
}

/**
 * One native dialog accepts a video, audio, SRT or still image. A video or image
 * is added to Project media only; audio becomes the project soundtrack; an SRT
 * arrives with the cues its text layer would receive, which the renderer applies
 * through the existing overwrite confirm (ED-P01, ticket 03).
 */
export type ImportedMedia =
  | { kind: 'video'; media: ProjectMedia }
  | { kind: 'audio'; source: AudioSource }
  | { kind: 'subtitle'; media: ProjectMedia; cues: Cue[] }
  | { kind: 'image'; media: ProjectMedia };

// These five keep today's `unknown` request shape verbatim (matching their current
// `app/ui/bridge.d.ts` signatures): the Editor session's own inline `requestRecord`/field checks
// stay in its handlers unchanged. Giving them a real shape here is ticket 07's job (Shrink the
// Editor session interface), not this seam-mechanism ticket's.
export const editorOperations = {
  // `Capabilities` (app/ui/bridge/client.ts) is renderer-only vocabulary the core registry
  // can't import; `app/ui/host-window.d.ts` narrows this one operation's result back onto it.
  hello: operation<undefined, Record<string, unknown>>()({
    rendererMethod: 'hello',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  open: operation<undefined, PublicVideo | null>()({
    rendererMethod: 'open',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  // Dropping a file on the viewer (MediaStage) resolves it to a path via the sandboxed preload's
  // `getPathForFile` (not a wire operation itself — see preload.cts), then opens it through this
  // one operation, which validates and registers the path the same way `open`'s dialog-picked
  // path does (app/electron/features/editor/ipc.ts).
  'open-path': operation<{ path: string }, PublicVideo | null>()({
    rendererMethod: 'openVideoPath',
    validate: (input) => ({ path: requestPath(input) }),
    toRequest: (path: string) => ({ path }),
  }),
  // `kind: 'image'` is the Logo section's own picker: the native dialog is filtered
  // to PNG/JPEG and only an image row can come back. No kind keeps the general
  // all-kinds Add…/Import Media dialog.
  'import-media': operation<{ kind?: 'image' } | undefined, ImportedMedia | null>()({
    rendererMethod: 'importMedia',
    validate: (input) => input as { kind?: 'image' } | undefined,
    toRequest: (kind?: 'image') => (kind ? { kind } : undefined),
  }),
  // A video dropped on the viewer while a project is already open is added to
  // that project's media, never a second source that replaces it (D-63). The
  // dropped file resolves to a path client-side (preload's getPathForFile), so
  // this registers it and returns the stored row the way `import-media` does.
  'media-add-path': operation<{ path: string }, ProjectMedia>()({
    rendererMethod: 'mediaAddPath',
    validate: (input) => ({ path: requestPath(input) }),
    toRequest: (path: string) => ({ path }),
  }),
  // Reading an already-added subtitle file back into cues, the row's own
  // import path once it is no longer the active import (the sha256 is checked
  // first, so a changed file is refused rather than silently swapped).
  'media-load': operation<unknown, { cues: Cue[] } | null>()({
    rendererMethod: 'mediaLoad',
    validate: (input) => input,
  }),
  // Re-choosing a stored Project media file whose original path is gone; the
  // host compares the re-registered sha256 against the saved one (SOURCE_CHANGED
  // on mismatch), the same check the soundtrack restore already uses.
  'media-relink': operation<unknown, { media: ProjectMedia } | null>()({
    rendererMethod: 'mediaRelink',
    validate: (input) => input,
  }),
  // Existence check for the stored Project media files, so a row can show its
  // relink affordance before anything tries to read the file.
  'media-check': operation<unknown, { missing: string[] }>()({
    rendererMethod: 'mediaCheck',
    validate: (input) => input,
  }),
  // Publishes a stored Project media image so the monitor can load it through
  // `media://local/...` (the app CSP blocks `file:`); the sha256 is checked so a
  // moved-and-changed file is refused rather than silently previewed.
  'media-url': operation<unknown, { url: string }>()({
    rendererMethod: 'mediaUrl',
    validate: (input) => input,
  }),
  ass: operation<unknown, { ass_text: string }>()({
    rendererMethod: 'ass',
    validate: (input) => input,
  }),
  peaks: operation<unknown, { peaks: number[]; duration_ms: number }>()({
    rendererMethod: 'peaks',
    validate: (input) => input,
  }),
  render: operation<unknown, { request_id: string; revision: number }>()({
    rendererMethod: 'render',
    validate: (input) => input,
    completesVia: 'job',
  }),
  cancel: operation<{ request_id: string }, { requested: boolean }>()({
    rendererMethod: 'cancel',
    validate: (input) => ({
      request_id: requestId(requestRecord(input, ['request_id']).request_id),
    }),
    toRequest: (id: string) => ({ request_id: id }),
  }),
  'save-subtitles': operation<unknown, SaveResult | null>()({
    rendererMethod: 'saveSubtitles',
    validate: (input) => input,
  }),
  'save-video': operation<{ artifact_id: string }, SaveResult | null>()({
    rendererMethod: 'saveVideo',
    validate: (input) => ({
      artifact_id: requestId(requestRecord(input, ['artifact_id']).artifact_id),
    }),
    toRequest: (id: string) => ({ artifact_id: id }),
  }),
  'open-project': operation<undefined, OpenedProject | null>()({
    rendererMethod: 'openProject',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  // A Recent entry for a project reopens straight from its own stored path and the source video
  // path captured when it was last saved/opened — no "choose the project file" /
  // "choose the source video" dialog pair, unlike `open-project` above, as long as both are still
  // where they were (app/electron/features/editor/ipc.ts fails loudly, not silently, if not).
  'open-project-path': operation<{ path: string }, OpenedProject | null>()({
    rendererMethod: 'openProjectPath',
    validate: (input) => ({ path: requestPath(input) }),
    toRequest: (path: string) => ({ path }),
  }),
  'save-project': operation<unknown, SaveResult | null>()({
    rendererMethod: 'saveProject',
    validate: (input) => input,
  }),
  // The header project switcher's Recent list (projects; recovered drafts come from the separate
  // recovery-list operation and are merged client-side, EditorProjectHeader.tsx).
  'recent-list': operation<undefined, RecentEntry[]>()({
    rendererMethod: 'recentList',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
} as const;
