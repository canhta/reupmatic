import type { MediaDownloadResult } from '../media/media-contracts.js';
import type { DouyinDetail } from './douyin-discovery-contracts.js';

export type DouyinDownloadState = 'queued' | 'running' | 'complete' | 'failed' | 'reused';

export type DouyinDownloadStage = 'observe' | 'resolve' | 'transfer' | 'commit';

export type DouyinMediaPath = 'direct';

export interface DouyinDownloadSelection {
  awemeId: string;
  tierIndex: number;
  directory?: string;
}

export interface DouyinDownloadItemState {
  awemeId: string;
  state: DouyinDownloadState;
  contentId?: string;
  code?: string;
  stage?: DouyinDownloadStage;
}

export interface DouyinDownloadSnapshot {
  items: DouyinDownloadItemState[];
  active: boolean;
  cancelled: boolean;
  total: number;
  completed: number;
  reused: number;
  failed: number;
}

// mirror_index/mirror_count are host diagnostics only, never sent on the wire.
export interface DouyinDownloadRequest {
  url: string;
  destination: string;
  mirror_index?: number;
  mirror_count?: number;
}

export interface DouyinIntakeCommit {
  detail: DouyinDetail;
  file: MediaDownloadResult;
  tierIndex: number;
  servedBy: DouyinMediaPath;
  downloadedAt: number;
}

export interface DouyinDownloadDeps {
  /** Identity lookup; filename equality is never consulted. */
  findHeld(awemeId: string): { id: string } | null;
  observe(awemeId: string): Promise<DouyinDetail>;
  reobserve?(awemeId: string): Promise<DouyinDetail>;
  destinationFor(detail: DouyinDetail, tierIndex: number, directory: string): string;
  /** Streams one CDN mirror; the host adds the session headers. */
  download(request: DouyinDownloadRequest): Promise<MediaDownloadResult>;
  commit(commit: DouyinIntakeCommit): Promise<{ id: string }>;
  now?: () => number;
  onProgress?: (snapshot: DouyinDownloadSnapshot) => void;
  isCancelled?: () => boolean;
}

export const DOUYIN_DOWNLOAD_FAILED = 'DOUYIN_DOWNLOAD_FAILED';

function codeOf(error: unknown): string {
  if (error instanceof Error && /^[A-Z][A-Z0-9_]*$/.test(error.message)) return error.message;
  return DOUYIN_DOWNLOAD_FAILED;
}

export function douyinTierUrlList(raw: unknown, tierIndex: number): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const payload = raw as Record<string, unknown>;
  const aweme =
    payload.aweme_detail && typeof payload.aweme_detail === 'object'
      ? (payload.aweme_detail as Record<string, unknown>)
      : payload;
  const video =
    aweme.video && typeof aweme.video === 'object'
      ? (aweme.video as Record<string, unknown>)
      : null;
  const ladder = Array.isArray(video?.bit_rate) ? (video?.bit_rate as unknown[]) : [];
  const entry = ladder[tierIndex];
  if (!entry || typeof entry !== 'object') return [];
  const playAddr = (entry as Record<string, unknown>).play_addr;
  if (!playAddr || typeof playAddr !== 'object') return [];
  const list = (playAddr as Record<string, unknown>).url_list;
  if (!Array.isArray(list)) return [];
  return list.filter((url): url is string => typeof url === 'string' && url.length > 0);
}

/** A missing URL is a real failure, never a success. */
export function douyinTierUrl(raw: unknown, tierIndex: number): string | null {
  return douyinTierUrlList(raw, tierIndex)[0] ?? null;
}

// Values ported from the MIT-licensed reference downloader; no code vendored.
const WATERMARK_HINTS = [
  'tplv-dy-water',
  'dy-water',
  'owner_watermark',
  'watermark_image',
  'watermark=1',
  'playwm',
];

function isWatermarkedMirror(url: string): boolean {
  const lower = url.toLowerCase();
  return WATERMARK_HINTS.some((hint) => lower.includes(hint));
}

export function douyinDownloadMirrors(raw: unknown, tierIndex: number): string[] {
  const all = douyinTierUrlList(raw, tierIndex);
  const clean = all.filter((url) => !isWatermarkedMirror(url));
  return clean.length > 0 ? clean : all;
}

/** Untrusted display text; must never reach a filesystem path unescaped. */
export function douyinDownloadBasename(description: string): string {
  const cleaned = description
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters cannot reach a path
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return Array.from(cleaned).slice(0, 80).join('').trim();
}

// Filename is for legibility on disk only, never identity.
export function douyinDownloadFilename(detail: DouyinDetail): string {
  const base = douyinDownloadBasename(detail.description) || 'douyin';
  const format = detail.video?.format?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const extension = Array.from(format).slice(0, 5).join('') || 'mp4';
  return `${base}-${detail.awemeId}.${extension}`;
}

export function snapshotOf(
  items: readonly DouyinDownloadItemState[],
  cancelled: boolean,
): DouyinDownloadSnapshot {
  return {
    // A copy: later ticks must not mutate an already-emitted snapshot.
    items: items.map((item) => ({ ...item })),
    active: items.some((item) => item.state === 'running'),
    cancelled,
    total: items.length,
    completed: items.filter((item) => item.state === 'complete').length,
    reused: items.filter((item) => item.state === 'reused').length,
    failed: items.filter((item) => item.state === 'failed').length,
  };
}

interface TransferOutcome {
  file: MediaDownloadResult;
  servedBy: DouyinMediaPath;
  detail: DouyinDetail;
}

// Only an HTTP refusal retries the next mirror / one fresh re-resolve; other errors fail as-is.
async function transferTier(
  initialDetail: DouyinDetail,
  initialMirrors: readonly string[],
  tierIndex: number,
  directory: string,
  deps: DouyinDownloadDeps,
): Promise<TransferOutcome> {
  const buildRequest = (
    detail: DouyinDetail,
    mirrors: readonly string[],
    mirrorIndex: number,
  ): DouyinDownloadRequest => ({
    url: mirrors[mirrorIndex] as string,
    destination: deps.destinationFor(detail, tierIndex, directory),
    mirror_index: mirrorIndex,
    mirror_count: mirrors.length,
  });

  async function tryMirrors(
    detail: DouyinDetail,
    mirrors: readonly string[],
  ): Promise<MediaDownloadResult> {
    let lastError: unknown = new Error('DOUYIN_MEDIA_URL_MISSING');
    for (let index = 0; index < mirrors.length; index += 1) {
      try {
        return await deps.download(buildRequest(detail, mirrors, index));
      } catch (error) {
        if (codeOf(error) !== 'DOWNLOAD_FAILED') throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  try {
    const file = await tryMirrors(initialDetail, initialMirrors);
    return { file, servedBy: 'direct', detail: initialDetail };
  } catch (firstError) {
    if (codeOf(firstError) !== 'DOWNLOAD_FAILED' || !deps.reobserve) throw firstError;
    const fresh = await deps.reobserve(initialDetail.awemeId);
    const freshMirrors = douyinDownloadMirrors(fresh.raw, tierIndex);
    if (freshMirrors.length === 0) throw new Error('DOUYIN_MEDIA_URL_MISSING');
    const file = await tryMirrors(fresh, freshMirrors);
    return { file, servedBy: 'direct', detail: fresh };
  }
}

export async function processDouyinDownloadItem(
  item: DouyinDownloadItemState,
  selection: DouyinDownloadSelection,
  deps: DouyinDownloadDeps,
  now: () => number,
  isCancelled: () => boolean,
  emit: () => void = () => undefined,
): Promise<'continue' | 'break'> {
  let stage: DouyinDownloadStage = 'observe';
  try {
    const held = deps.findHeld(selection.awemeId);
    if (held) {
      item.state = 'reused';
      item.contentId = held.id;
      return 'continue';
    }

    item.state = 'running';
    emit();

    let detail = await deps.observe(selection.awemeId);
    stage = 'resolve';
    const mirrors = douyinDownloadMirrors(detail.raw, selection.tierIndex);
    if (mirrors.length === 0) throw new Error('DOUYIN_MEDIA_URL_MISSING');

    stage = 'transfer';
    const outcome = await transferTier(
      detail,
      mirrors,
      selection.tierIndex,
      selection.directory ?? '',
      deps,
    );
    detail = outcome.detail;

    if (isCancelled()) {
      item.state = 'queued';
      return 'break';
    }

    stage = 'commit';
    const committed = await deps.commit({
      detail,
      file: outcome.file,
      tierIndex: selection.tierIndex,
      servedBy: outcome.servedBy,
      downloadedAt: now(),
    });
    item.state = 'complete';
    item.contentId = committed.id;
    return 'continue';
  } catch (error) {
    if (isCancelled()) {
      item.state = 'queued';
      return 'break';
    }
    item.state = 'failed';
    item.code = codeOf(error);
    item.stage = stage;
    return 'continue';
  }
}

export async function runDouyinDownloads(
  selections: readonly DouyinDownloadSelection[],
  deps: DouyinDownloadDeps,
): Promise<DouyinDownloadSnapshot> {
  const now = deps.now ?? Date.now;
  const isCancelled = deps.isCancelled ?? (() => false);
  const items: DouyinDownloadItemState[] = selections.map((selection) => ({
    awemeId: selection.awemeId,
    state: 'queued',
  }));
  const emit = () => deps.onProgress?.(snapshotOf(items, isCancelled()));

  emit();

  for (let index = 0; index < selections.length; index += 1) {
    const selection = selections[index];
    const item = items[index];
    if (!selection || !item) continue;
    if (isCancelled()) break;

    const outcome = await processDouyinDownloadItem(item, selection, deps, now, isCancelled, emit);
    emit();
    if (outcome === 'break') break;
  }

  const final = snapshotOf(items, isCancelled());
  deps.onProgress?.(final);
  return final;
}
