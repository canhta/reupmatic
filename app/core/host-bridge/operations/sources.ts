import type { DouyinChannel } from '../../sources/douyin-channel-store.js';
import type { DouyinSessionSnapshot } from '../../sources/douyin-contracts.js';
import type { DouyinDetail, DouyinOutcome } from '../../sources/douyin-discovery-contracts.js';
import type { DouyinDownloadSnapshot } from '../../sources/douyin-download.js';
import type { DouyinSearchViewOutcome } from '../../sources/douyin-search.js';
import { operation } from '../operation-contract.js';
import { requestRecord } from '../validators.js';

const MAX_DOWNLOAD_SELECTION = 200;

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
  'douyin-clipboard-text': operation<undefined, { text: string }>()({
    rendererMethod: 'douyinClipboardText',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'douyin-channels': operation<undefined, DouyinChannel[]>()({
    rendererMethod: 'douyinChannels',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'douyin-download': operation<
    { items: DouyinDownloadRequestItem[]; save_to?: boolean },
    DouyinDownloadSnapshot | null
  >()({
    rendererMethod: 'douyinDownload',
    validate: requestDownloadSelection,
    toRequest: (input) => input,
  }),
  'douyin-download-cancel': operation<undefined, { requested: boolean }>()({
    rendererMethod: 'douyinDownloadCancel',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
} as const;
