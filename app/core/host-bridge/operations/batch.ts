import type { BatchSelection, BatchSnapshot, BatchSubmit } from '../../batch/batch-contracts.js';
import { parseReusableRecipe } from '../../processing/recipe.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export const batchOperations = {
  'batch-snapshot': operation<undefined, BatchSnapshot>()({
    rendererMethod: 'batchSnapshot',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'batch-pick-videos': operation<undefined, BatchSelection | null>()({
    rendererMethod: 'batchPickVideos',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'batch-from-library': operation<{ item_ids: string[] }, BatchSelection>()({
    rendererMethod: 'batchFromLibrary',
    validate: (input) => {
      const value = requestRecord(input, ['item_ids']);
      if (!Array.isArray(value.item_ids)) throw new Error('INVALID_REQUEST');
      return { item_ids: value.item_ids.map(requestId) };
    },
    toRequest: (ids: string[]) => ({ item_ids: ids }),
  }),
  'batch-pick-subtitle': operation<
    undefined,
    { subtitle_id: string; subtitle_name: string } | null
  >()({
    rendererMethod: 'batchPickSubtitle',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'batch-pick-directory': operation<undefined, { output_id: string; name: string } | null>()({
    rendererMethod: 'batchPickDirectory',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'batch-enqueue': operation<BatchSubmit, BatchSnapshot>()({
    rendererMethod: 'batchEnqueue',
    validate: (input) => {
      const value = requestRecord(input, ['request_id', 'output_id', 'items', 'processing']);
      if (!Array.isArray(value.items)) throw new Error('INVALID_REQUEST');
      const items = value.items.map((raw) => {
        const item = requestRecord(raw, ['asset_id', 'subtitle_id']);
        return {
          asset_id: requestId(item.asset_id),
          ...(item.subtitle_id === undefined ? {} : { subtitle_id: requestId(item.subtitle_id) }),
        };
      });
      return {
        request_id: requestId(value.request_id),
        output_id: requestId(value.output_id),
        items,
        processing:
          value.processing === undefined ? undefined : parseReusableRecipe(value.processing),
      };
    },
  }),
  'batch-pause': operation<undefined, BatchSnapshot>()({
    rendererMethod: 'batchPause',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'batch-resume': operation<undefined, BatchSnapshot>()({
    rendererMethod: 'batchResume',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'batch-cancel': operation<{ job_id: string }, BatchSnapshot>()({
    rendererMethod: 'batchCancel',
    validate: (input) => ({ job_id: requestId(requestRecord(input, ['job_id']).job_id) }),
    toRequest: (id: string) => ({ job_id: id }),
  }),
  'batch-retry': operation<{ job_id: string }, BatchSnapshot>()({
    rendererMethod: 'batchRetry',
    validate: (input) => ({ job_id: requestId(requestRecord(input, ['job_id']).job_id) }),
    toRequest: (id: string) => ({ job_id: id }),
  }),
  'batch-reveal': operation<{ job_id: string }, { revealed: boolean }>()({
    rendererMethod: 'batchReveal',
    validate: (input) => ({ job_id: requestId(requestRecord(input, ['job_id']).job_id) }),
    toRequest: (id: string) => ({ job_id: id }),
  }),
} as const;
