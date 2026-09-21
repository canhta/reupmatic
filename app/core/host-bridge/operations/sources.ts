import type { DouyinChannel } from '../../sources/douyin-channel-store.js';
import type { DouyinSessionSnapshot } from '../../sources/douyin-contracts.js';
import type { DouyinDetail, DouyinOutcome } from '../../sources/douyin-discovery-contracts.js';
import type { DouyinDownloadSnapshot } from '../../sources/douyin-download.js';
import type { DouyinSearchViewOutcome } from '../../sources/douyin-search.js';
import { operation } from '../operation-contract.js';
import { requestRecord } from '../validators.js';

const MAX_DOWNLOAD_SELECTION = 200;

/** The download selection as it crosses the wire: a candidate id and the tier chosen for it. */
export interface DouyinDownloadRequestItem {
  aweme_id: string;
  tier_index: number;
}

function requestDownloadSelection(input: unknown): {
  items: DouyinDownloadRequestItem[];
  save_to: boolean;
} {
  const value = requestRecord(input, ['items', 'save_to']);
  if (!Array.isArray(value.items) || value.items.length === 0) throw new Error('INVALID_REQUEST');
  if (value.items.length > MAX_DOWNLOAD_SELECTION) throw new Error('SELECTION_LIMIT');
  const items = value.items.map((entry) => {
    const row = requestRecord(entry, ['aweme_id', 'tier_index']);
    const awemeId = row.aweme_id;
    const tierIndex = row.tier_index;
    if (typeof awemeId !== 'string' || !/^[0-9]{1,32}$/.test(awemeId))
      throw new Error('INVALID_REQUEST');
    if (!Number.isInteger(tierIndex) || Number(tierIndex) < 0 || Number(tierIndex) > 31)
      throw new Error('INVALID_REQUEST');
    return { aweme_id: awemeId, tier_index: Number(tierIndex) };
  });
  if (value.save_to !== undefined && typeof value.save_to !== 'boolean')
    throw new Error('INVALID_REQUEST');
  return { items, save_to: value.save_to === true };
}
/** The `persist:douyin` session's connect/reconnect/disconnect/status (ticket 01), plus one
 * video's detail through the signed page (ticket 04). Listing, filtering and download do not
 * cross this boundary yet. */
export const sourcesOperations = {
  'douyin-status': operation<undefined, DouyinSessionSnapshot>()({
    rendererMethod: 'douyinStatus',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'douyin-connect': operation<undefined, DouyinSessionSnapshot>()({
    rendererMethod: 'douyinConnect',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'douyin-reconnect': operation<undefined, DouyinSessionSnapshot>()({
    rendererMethod: 'douyinReconnect',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  /**
   * Opens the headed Douyin window on the exact page Douyin's verification challenge stopped, so
   * the user solves it where the interrupted request runs. The captured response is remembered
   * host-side; the renderer only receives the refreshed session status. Distinct from Reconnect,
   * which always opens Douyin's home page.
   */
  'douyin-verify': operation<undefined, DouyinSessionSnapshot>()({
    rendererMethod: 'douyinVerify',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'douyin-disconnect': operation<undefined, DouyinSessionSnapshot>()({
    rendererMethod: 'douyinDisconnect',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  /**
   * The advanced path into the same session Connect builds: pasted cookies are injected into the
   * same partition, so everything downstream takes one identical code path. The paste is parsed
   * and validated host-side; the renderer never keeps it.
   */
  'douyin-import-cookies': operation<{ text: string }, DouyinSessionSnapshot>()({
    rendererMethod: 'douyinImportCookies',
    validate: (input) => {
      const value = requestRecord(input, ['text']);
      const text = value.text;
      if (typeof text !== 'string' || text.length === 0 || text.length > 65536)
        throw new Error('INVALID_REQUEST');
      return { text };
    },
    toRequest: (input) => input,
  }),
  /**
   * Detail for one video. A failure is returned as data rather than thrown, because the caller
   * must distinguish them: `login_required` routes to Reconnect, `refused` must not offer a
   * retry, and neither may render as an empty result.
   */
  'douyin-detail': operation<{ aweme_id: string }, DouyinOutcome<DouyinDetail>>()({
    rendererMethod: 'douyinDetail',
    validate: (input) => {
      const value = requestRecord(input, ['aweme_id']);
      const awemeId = value.aweme_id;
      if (typeof awemeId !== 'string' || !/^[0-9]{1,32}$/.test(awemeId))
        throw new Error('INVALID_REQUEST');
      return { aweme_id: awemeId };
    },
    toRequest: (input) => input,
  }),
  /**
   * The one Search action (ticket 05): pasted link or share text in, exact item plus channel
   * listing out. A refused / expired source and an unsupported link are returned as data, so the
   * renderer can render each honestly instead of flattening them into one generic error.
   */
  'douyin-search': operation<{ text: string }, DouyinSearchViewOutcome>()({
    rendererMethod: 'douyinSearch',
    validate: (input) => {
      const value = requestRecord(input, ['text']);
      const text = value.text;
      if (typeof text !== 'string' || text.length === 0 || text.length > 4096)
        throw new Error('INVALID_REQUEST');
      return { text };
    },
    toRequest: (input) => input,
  }),
  /**
   * Reads the clipboard for the one Search action's primary entry ("take what is on the
   * clipboard"). Keyboard-only callers still have the paste dialog; this is an accelerator, never
   * the only path. Capped so a huge paste cannot cross the boundary.
   */
  'douyin-clipboard-text': operation<undefined, { text: string }>()({
    rendererMethod: 'douyinClipboardText',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  /**
   * The saved Douyin channels, most recently scanned first. A search that returns a channel
   * upserts it host-side, so the renderer only ever reads this list.
   */
  'douyin-channels': operation<undefined, DouyinChannel[]>()({
    rendererMethod: 'douyinChannels',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  /**
   * D-62's download-only endpoint: the selected candidates are appended to the persistent
   * download queue, streamed to the default download folder (Settings), or, with `save_to: true`,
   * to a folder this one run's own picker chooses. Returns `null` when a picker (the default
   * folder's first-time ask, or the "Save to…" override) was dismissed, so a cancelled choice is
   * not an error and starts nothing. This call resolves once the selection is queued, not once it
   * finishes — the run keeps going in the background and is reported through the
   * `douyin-download` event; the returned snapshot is the queue's state at enqueue time, not the
   * final result.
   */
  'douyin-download': operation<
    { items: DouyinDownloadRequestItem[]; save_to?: boolean },
    DouyinDownloadSnapshot | null
  >()({
    rendererMethod: 'douyinDownload',
    validate: requestDownloadSelection,
    toRequest: (input) => input,
  }),
  /** Stops the active run at the next candidate boundary; no partial file or Library entry remains. */
  'douyin-download-cancel': operation<undefined, { requested: boolean }>()({
    rendererMethod: 'douyinDownloadCancel',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
} as const;
