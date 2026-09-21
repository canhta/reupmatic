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

export interface OpenedProject {
  media: PublicVideo;
  snapshot: EditorSnapshot;
  project_path?: string;
}

export type ImportedMedia =
  | { kind: 'video'; media: ProjectMedia }
  | { kind: 'audio'; source: AudioSource }
  | { kind: 'subtitle'; media: ProjectMedia; cues: Cue[] }
  | { kind: 'image'; media: ProjectMedia };

export const editorOperations = {
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
  'open-path': operation<{ path: string }, PublicVideo | null>()({
    rendererMethod: 'openVideoPath',
    validate: (input) => ({ path: requestPath(input) }),
    toRequest: (path: string) => ({ path }),
  }),
  'import-media': operation<{ kind?: 'image' } | undefined, ImportedMedia | null>()({
    rendererMethod: 'importMedia',
    validate: (input) => input as { kind?: 'image' } | undefined,
    toRequest: (kind?: 'image') => (kind ? { kind } : undefined),
  }),
  'media-add-path': operation<{ path: string }, ProjectMedia>()({
    rendererMethod: 'mediaAddPath',
    validate: (input) => ({ path: requestPath(input) }),
    toRequest: (path: string) => ({ path }),
  }),
  'media-load': operation<unknown, { cues: Cue[] } | null>()({
    rendererMethod: 'mediaLoad',
    validate: (input) => input,
  }),
  'media-relink': operation<unknown, { media: ProjectMedia } | null>()({
    rendererMethod: 'mediaRelink',
    validate: (input) => input,
  }),
  'media-check': operation<unknown, { missing: string[] }>()({
    rendererMethod: 'mediaCheck',
    validate: (input) => input,
  }),
  // Publishes so the monitor can load through `media://local/...`; the app CSP blocks `file:`.
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
  'open-project-path': operation<{ path: string }, OpenedProject | null>()({
    rendererMethod: 'openProjectPath',
    validate: (input) => ({ path: requestPath(input) }),
    toRequest: (path: string) => ({ path }),
  }),
  'save-project': operation<unknown, SaveResult | null>()({
    rendererMethod: 'saveProject',
    validate: (input) => input,
  }),
  'recent-list': operation<undefined, RecentEntry[]>()({
    rendererMethod: 'recentList',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
} as const;
