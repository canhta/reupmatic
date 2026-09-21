/**
 * Download orchestration for selected Douyin candidates.
 *
 * The worker (`media.download`) owns the bytes: streaming, resume, `Content-Length` verification,
 * partial cleanup and the FFmpeg probe. This module owns the decisions around it, which are the
 * ones that are testable without Electron or a live Douyin:
 *
 * - **Identity is `aweme_id`, never a filename.** A candidate already held by the Library is
 *   reported `reused` and no network request is made (SL-R07).
 * - **The media URL is re-resolved at use.** `play_addr.url_list` expires, so the typed discovery
 *   projection deliberately drops it; the caller observes the item's own page (or its retained
 *   observation) and this reads the chosen tier's mirrors from that raw payload.
 * - **Every clean mirror of the chosen tier is tried, then one fresh re-resolve.** A CDN mirror can
 *   go stale on its own; a full-mirror refusal re-resolves the item once (`reobserve`) and retries
 *   the fresh mirrors. There is no page-context fallback — D-62 removed the browser page entirely
 *   — so a refusal that survives the re-resolve is the honest, terminal `transfer` failure.
 * - **One failing item never takes the run down.** Each candidate is attempted independently; a
 *   candidate reports exactly one terminal state.
 *
 * The module is pure over injected seams (`observe`, `download`, `commit`, …), so a test drives it
 * with fixtures and a local HTTP server while Electron supplies the real session and worker.
 */

import type { MediaDownloadResult } from '../media/media-contracts.js';
import type { DouyinDetail } from './douyin-discovery-contracts.js';

/** Per-candidate lifecycle, as rendered on the candidate's own row. */
export type DouyinDownloadState = 'queued' | 'running' | 'complete' | 'failed' | 'reused';

/**
 * Where a failed candidate stopped: its page/detail could not be observed, no media URL could be
 * resolved from it, the bytes did not transfer, or the Library refused the finished file. The code
 * alone cannot tell a refused page from a refused CDN; the stage can.
 */
export type DouyinDownloadStage = 'observe' | 'resolve' | 'transfer' | 'commit';

/** Which path actually served the bytes. D-62 removed the browser page entirely, so a direct CDN
 * transfer is the only path this module can ever produce; the Library's own `DouyinServedBy`
 * (`intake-contracts.ts`) stays wider, since a historical record may still carry `'page'`. */
export type DouyinMediaPath = 'direct';

export interface DouyinDownloadSelection {
  awemeId: string;
  /** Index into `video.bit_rate[]` chosen for this item; the ladder is best-first. */
  tierIndex: number;
  /** The destination directory this selection was queued against (default folder or a per-run
   * "Save to…" override, D-62). Optional so a caller with a single run-wide folder (the existing
   * one-shot `runDouyinDownloads` callers) can omit it and fold the choice into `destinationFor`
   * instead. */
  directory?: string;
}

export interface DouyinDownloadItemState {
  awemeId: string;
  state: DouyinDownloadState;
  /** The Library id once held (complete) or matched (reused). */
  contentId?: string;
  /** The stable failure code when `state` is `failed`. Exactly one per failed item. */
  code?: string;
  /** The step that failed, when `state` is `failed`. */
  stage?: DouyinDownloadStage;
}

/**
 * A whole-run snapshot, sent on every transition. The renderer keeps the latest one so finished
 * rows stay visible after the run ends, and the one status-bar affordance reads its counts rather
 * than owning a second queue.
 */
export interface DouyinDownloadSnapshot {
  items: DouyinDownloadItemState[];
  active: boolean;
  cancelled: boolean;
  total: number;
  completed: number;
  reused: number;
  failed: number;
}

/**
 * What the caller hands the worker's `media.download`. No cookie or referer value is part of it:
 * the session belongs to the Electron host, which adds those headers at request time, so this core
 * module never holds a raw credential.
 *
 * No `expected_size`: Douyin's own tier `data_size` is a claim, not a completion fact — a live
 * check (coordinator) found it disagreeing with the bytes a tier's own mirror actually
 * serves, which turned a real, playable download into a manufactured `DOWNLOAD_SIZE_MISMATCH`.
 * The worker already verifies the transfer against the one number the server commits to
 * (`Content-Length`, matching the reference downloader), and `probe_file`'s FFmpeg pass is the
 * real completion fact (SC-01 SL-AC03); Douyin's declared size adds a false negative, not a real
 * check.
 *
 * `mirror_index`/`mirror_count` describe which of the tier's CDN mirrors this attempt is (D-62's
 * transfer hardening): they exist for the host's own transfer diagnostics and are never part of
 * the wire request the worker actually receives.
 */
export interface DouyinDownloadRequest {
  url: string;
  destination: string;
  mirror_index?: number;
  mirror_count?: number;
}

/** What the Library needs to create the one content record plus its intake and tags. */
export interface DouyinIntakeCommit {
  detail: DouyinDetail;
  file: MediaDownloadResult;
  tierIndex: number;
  servedBy: DouyinMediaPath;
  downloadedAt: number;
}

export interface DouyinDownloadDeps {
  /** The Library lookup that establishes identity. Filename equality is never consulted. */
  findHeld(awemeId: string): { id: string } | null;
  /**
   * The item's own page (or a retained observation of it), including the untouched raw payload.
   * Throws a stable uppercase code when the source refuses before any URL exists.
   */
  observe(awemeId: string): Promise<DouyinDetail>;
  /**
   * A fresh observation that bypasses any retained/cached one (D-62's transfer hardening): every
   * mirror of the chosen tier can go stale together (an expired signed URL, a dead CDN edge), and
   * the fix is a fresh page/detail read, never a retry of the same expired payload. Absent means
   * "no fresh read available"; a full-mirror refusal then stands as-is.
   */
  reobserve?(awemeId: string): Promise<DouyinDetail>;
  /** The absolute path the bytes land at, in the directory this selection was queued against.
   * Never used to decide identity. */
  destinationFor(detail: DouyinDetail, tierIndex: number, directory: string): string;
  /** Streams one CDN mirror through the worker; the host adds the session headers. */
  download(request: DouyinDownloadRequest): Promise<MediaDownloadResult>;
  /** Registers the held bytes plus ticket 09's projection and tags. Only called on success. */
  commit(commit: DouyinIntakeCommit): Promise<{ id: string }>;
  now?: () => number;
  onProgress?: (snapshot: DouyinDownloadSnapshot) => void;
  isCancelled?: () => boolean;
}

/** The one code a failed candidate reports when the failure carries no stable code of its own. */
export const DOUYIN_DOWNLOAD_FAILED = 'DOUYIN_DOWNLOAD_FAILED';

function codeOf(error: unknown): string {
  if (error instanceof Error && /^[A-Z][A-Z0-9_]*$/.test(error.message)) return error.message;
  return DOUYIN_DOWNLOAD_FAILED;
}

/**
 * The chosen tier's CDN mirrors from the untouched payload. The typed projection drops `url_list`
 * on purpose (it expires); this is the one place it is read back, at use, never persisted.
 */
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

/**
 * The first usable mirror for a tier, or `null` when the payload carries none. A missing URL is a
 * real failure, never an empty success.
 */
export function douyinTierUrl(raw: unknown, tierIndex: number): string | null {
  return douyinTierUrlList(raw, tierIndex)[0] ?? null;
}

/**
 * URL hints a mirror carries the watermarked (`playwm`-style) rendition, ported as values only
 * from the reference downloader's `_is_watermarked_media_url`
 * (`/Users/canh/Solo/OSS/douyin-downloader/core/downloader_base.py:1663-1673`) — no code from
 * that project is vendored, only this hint list.
 */
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

/**
 * The chosen tier's mirrors, obviously-watermarked ones skipped (D-62's transfer hardening,
 * reference ordering at `downloader_base.py:1178-1262`). Falls back to the unfiltered list when
 * every mirror looks watermarked, so a tier that genuinely offers no clean mirror still attempts
 * a transfer instead of failing before it starts.
 */
export function douyinDownloadMirrors(raw: unknown, tierIndex: number): string[] {
  const all = douyinTierUrlList(raw, tierIndex);
  const clean = all.filter((url) => !isWatermarkedMirror(url));
  return clean.length > 0 ? clean : all;
}

/** A description is untrusted display text; it must never reach a filesystem path unescaped. */
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

/**
 * `aweme_id` is always in the filename so the catalog is legible on disk, but the filename is not
 * identity: two different items that sanitize to the same text still stay distinct, and the same
 * item under a different name is still the same item.
 */
export function douyinDownloadFilename(detail: DouyinDetail): string {
  const base = douyinDownloadBasename(detail.description) || 'douyin';
  const format = detail.video?.format?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const extension = Array.from(format).slice(0, 5).join('') || 'mp4';
  return `${base}-${detail.awemeId}.${extension}`;
}

/** Exported so the persistent queue (`douyin-download-queue.ts`) renders the exact same snapshot
 * shape from its own live item list. */
export function snapshotOf(
  items: readonly DouyinDownloadItemState[],
  cancelled: boolean,
): DouyinDownloadSnapshot {
  return {
    // A copy: each emitted snapshot is the state at that instant, not a view that later ticks
    // mutate underneath the renderer.
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
  /** The detail actually served the bytes — the initial one, or a `reobserve` refresh. */
  detail: DouyinDetail;
}

/**
 * Streams the chosen tier for one item (D-62's transfer hardening): every clean mirror is tried
 * in order before the tier counts as refused. A full-mirror HTTP refusal (`DOWNLOAD_FAILED`)
 * re-resolves the item once through `deps.reobserve` when available — the payload's mirrors can
 * all go stale together (an expired signed URL, a dead CDN edge) — and retries against the fresh
 * mirrors. There is no page-context fallback (D-62 removed the browser page entirely): a
 * full-mirror refusal that survives the re-resolve is the honest, terminal `transfer` failure.
 * Any non-refusal error (a size mismatch, a bad destination) is never retried at any step:
 * retrying it would fail identically and paper over a different problem.
 */
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
        // Only an HTTP refusal is worth trying the next mirror; anything else (a size mismatch,
        // an unsafe destination) would fail identically there.
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

/**
 * Runs one selection through identity check (reuse, no request) → observe its page → resolve the
 * chosen tier's mirrors at use → transfer (every mirror, then one fresh re-resolve) → commit into
 * the Library, mutating `item` to its terminal state. A failure at any step reports exactly one
 * `failed` state; cancellation between the transfer and the commit never commits a partial item.
 * Shared by the one-shot `runDouyinDownloads` below and the persistent queue
 * (`douyin-download-queue.ts`), so both drive identical per-candidate behaviour.
 *
 * `emit` fires once the item is visibly `running`, before the (possibly slow) network calls; the
 * caller is responsible for its own emit once this resolves.
 */
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
      // Cancelled after the transfer but before the commit: no record is created, and the row
      // must not stay `running`, which would keep the whole run looking active forever.
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

/**
 * Runs one fixed download selection to completion, isolating each candidate. See
 * `processDouyinDownloadItem` for the per-candidate ordering; this is the one-shot driver over a
 * whole selection array (the persistent queue in `douyin-download-queue.ts` drives the same
 * per-item logic over a list that can grow while it runs).
 */
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

  // The initial queue is visible before the first network call, so no row sits blank.
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
