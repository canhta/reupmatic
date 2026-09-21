import {
  parseTranslationInput,
  type TranslationInput,
  type TranslationStatus,
} from '../../speech/translation/contracts.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export const translationOperations = {
  'translation-status': operation<undefined, TranslationStatus>()({
    rendererMethod: 'translationStatus',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'translation-start': operation<TranslationInput, { request_id: string; revision: number }>()({
    rendererMethod: 'translationStart',
    validate: (input) => parseTranslationInput(input),
    completesVia: 'translation-job',
  }),
  'translation-cancel': operation<{ request_id: string }, { requested: boolean }>()({
    rendererMethod: 'translationCancel',
    validate: (input) => ({
      request_id: requestId(requestRecord(input, ['request_id']).request_id),
    }),
    toRequest: (id: string) => ({ request_id: id }),
  }),
  'translation-configure': operation<undefined, TranslationStatus | null>()({
    rendererMethod: 'translationConfigure',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'translation-cancel-setup': operation<undefined, { requested: boolean }>()({
    rendererMethod: 'translationCancelSetup',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
} as const;
