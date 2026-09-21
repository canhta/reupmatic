import type { MutationIdentity } from '../../catalog/catalog-contracts.js';
import type { CatalogSnapshot } from '../../catalog/catalog-snapshot.js';
import type { ContentLabels, Label, SaveLabel } from '../../taxonomy/taxonomy-contracts.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export const catalogOperations = {
  'catalog-snapshot': operation<undefined, CatalogSnapshot>()({
    rendererMethod: 'catalogSnapshot',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'catalog-save-label': operation<SaveLabel, Label>()({
    rendererMethod: 'catalogSaveLabel',
    validate: (input) => input as SaveLabel,
  }),
  'catalog-content-labels': operation<MutationIdentity & { label_ids: string[] }, ContentLabels>()({
    rendererMethod: 'catalogContentLabels',
    validate: (input) => {
      const value = requestRecord(input, ['id', 'expected_revision', 'label_ids']);
      requestId(value.id);
      return input as MutationIdentity & { label_ids: string[] };
    },
  }),
} as const;
