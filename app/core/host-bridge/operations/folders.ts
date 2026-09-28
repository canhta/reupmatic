import type { FolderCreate, FolderSnapshot } from '../../folders/folder-contracts.js';
import { parseReusableRecipe } from '../../processing/recipe.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export const folderOperations = {
  'folder-snapshot': operation<undefined, FolderSnapshot>()({
    rendererMethod: 'folderSnapshot',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'folder-pick-source': operation<undefined, { directory_id: string; name: string } | null>()({
    rendererMethod: 'folderPickSource',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'folder-pick-output': operation<undefined, { directory_id: string; name: string } | null>()({
    rendererMethod: 'folderPickOutput',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'folder-create': operation<FolderCreate, FolderSnapshot>()({
    rendererMethod: 'folderCreate',
    validate: (input) => {
      const value = requestRecord(input, [
        'source_id',
        'output_id',
        'include_existing',
        'recursive',
        'processing',
      ]);
      if (typeof value.include_existing !== 'boolean' || typeof value.recursive !== 'boolean')
        throw new Error('INVALID_REQUEST');
      return {
        source_id: requestId(value.source_id),
        output_id: requestId(value.output_id),
        include_existing: value.include_existing,
        recursive: value.recursive,
        processing:
          value.processing === undefined ? undefined : parseReusableRecipe(value.processing),
      };
    },
  }),
  'folder-start': operation<{ rule_id: string }, FolderSnapshot>()({
    rendererMethod: 'folderStart',
    validate: (input) => ({ rule_id: requestId(requestRecord(input, ['rule_id']).rule_id) }),
    toRequest: (id: string) => ({ rule_id: id }),
  }),
  'folder-pause': operation<{ rule_id: string }, FolderSnapshot>()({
    rendererMethod: 'folderPause',
    validate: (input) => ({ rule_id: requestId(requestRecord(input, ['rule_id']).rule_id) }),
    toRequest: (id: string) => ({ rule_id: id }),
  }),
} as const;
