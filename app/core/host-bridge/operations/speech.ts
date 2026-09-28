import type { OfferedCatalogue } from '../../speech/model-catalogue.js';
import {
  assertProtocolImplemented,
  parseModelDraft,
  parseProviderDraft,
  type SpeechProvider,
  type SpeechProviderDraft,
  type SpeechProviderModelDraft,
} from '../../speech/providers.js';
import { parseSpeechInput, type SpeechInput, type SpeechStatus } from '../../speech/recognition.js';
import { RemoteError } from '../../worker/remote-error.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value || value.length > max || value.includes('\0')) {
    throw new RemoteError('INVALID_REQUEST');
  }
  return value;
}

export const speechOperations = {
  'speech-status': operation<undefined, SpeechStatus>()({
    rendererMethod: 'speechStatus',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'speech-start': operation<SpeechInput, { request_id: string; revision: number }>()({
    rendererMethod: 'speechStart',
    validate: (input) => parseSpeechInput(input),
    completesVia: 'speech-job',
  }),
  'speech-cancel': operation<{ request_id: string }, { requested: boolean }>()({
    rendererMethod: 'speechCancel',
    validate: (input) => ({
      request_id: requestId(requestRecord(input, ['request_id']).request_id),
    }),
    toRequest: (id: string) => ({ request_id: id }),
  }),
  'speech-configure': operation<undefined, SpeechStatus | null>()({
    rendererMethod: 'speechConfigure',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'speech-cancel-setup': operation<undefined, { requested: boolean }>()({
    rendererMethod: 'speechCancelSetup',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'speech-offered-models': operation<undefined, OfferedCatalogue>()({
    rendererMethod: 'speechOfferedModels',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'speech-model-install-start': operation<{ catalogue_id: string }, { request_id: string }>()({
    rendererMethod: 'speechModelInstallStart',
    validate: (input) => ({
      catalogue_id: boundedText(requestRecord(input, ['catalogue_id']).catalogue_id, 64),
    }),
    toRequest: (catalogueId: string) => ({ catalogue_id: catalogueId }),
    completesVia: 'speech-model-install',
  }),
  'speech-model-install-cancel': operation<{ request_id: string }, { requested: boolean }>()({
    rendererMethod: 'speechModelInstallCancel',
    validate: (input) => ({
      request_id: requestId(requestRecord(input, ['request_id']).request_id),
    }),
    toRequest: (id: string) => ({ request_id: id }),
  }),
  'speech-model-activate': operation<{ catalogue_id: string }, { activated: boolean }>()({
    rendererMethod: 'speechModelActivate',
    validate: (input) => ({
      catalogue_id: boundedText(requestRecord(input, ['catalogue_id']).catalogue_id, 64),
    }),
    toRequest: (catalogueId: string) => ({ catalogue_id: catalogueId }),
  }),
  'speech-model-remove': operation<{ catalogue_id: string }, { removed: boolean }>()({
    rendererMethod: 'speechModelRemove',
    validate: (input) => ({
      catalogue_id: boundedText(requestRecord(input, ['catalogue_id']).catalogue_id, 64),
    }),
    toRequest: (catalogueId: string) => ({ catalogue_id: catalogueId }),
  }),
  // An unimplemented protocol is refused before the store touches disk.
  'speech-providers-list': operation<undefined, SpeechProvider[]>()({
    rendererMethod: 'speechProvidersList',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'speech-provider-protocols': operation<undefined, string[]>()({
    rendererMethod: 'speechProviderProtocols',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'speech-provider-add': operation<
    { draft: SpeechProviderDraft; credential: string },
    SpeechProvider
  >()({
    rendererMethod: 'speechProviderAdd',
    validate: (input) => {
      const value = requestRecord(input, ['draft', 'credential']);
      const draft = parseProviderDraft(value.draft);
      assertProtocolImplemented(draft.protocol);
      return { draft, credential: boundedText(value.credential, 4096) };
    },
    toRequest: (draft: SpeechProviderDraft, credential: string) => ({ draft, credential }),
  }),
  'speech-provider-update': operation<{ id: string; draft: SpeechProviderDraft }, SpeechProvider>()(
    {
      rendererMethod: 'speechProviderUpdate',
      validate: (input) => {
        const value = requestRecord(input, ['id', 'draft']);
        const draft = parseProviderDraft(value.draft);
        assertProtocolImplemented(draft.protocol);
        return { id: requestId(value.id), draft };
      },
      toRequest: (id: string, draft: SpeechProviderDraft) => ({ id, draft }),
    },
  ),
  'speech-provider-remove': operation<{ id: string }, { removed: boolean }>()({
    rendererMethod: 'speechProviderRemove',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  'speech-provider-credential-set': operation<
    { id: string; credential: string },
    { ok: boolean }
  >()({
    rendererMethod: 'speechProviderCredentialSet',
    validate: (input) => {
      const value = requestRecord(input, ['id', 'credential']);
      return { id: requestId(value.id), credential: boundedText(value.credential, 4096) };
    },
    toRequest: (id: string, credential: string) => ({ id, credential }),
  }),
  'speech-provider-credential-remove': operation<{ id: string }, { ok: boolean }>()({
    rendererMethod: 'speechProviderCredentialRemove',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  'speech-provider-model-add': operation<
    { provider_id: string; draft: SpeechProviderModelDraft },
    SpeechProvider
  >()({
    rendererMethod: 'speechProviderModelAdd',
    validate: (input) => {
      const value = requestRecord(input, ['provider_id', 'draft']);
      return { provider_id: requestId(value.provider_id), draft: parseModelDraft(value.draft) };
    },
    toRequest: (providerId: string, draft: SpeechProviderModelDraft) => ({
      provider_id: providerId,
      draft,
    }),
  }),
  'speech-provider-model-update': operation<
    { provider_id: string; model_key: string; draft: SpeechProviderModelDraft },
    SpeechProvider
  >()({
    rendererMethod: 'speechProviderModelUpdate',
    validate: (input) => {
      const value = requestRecord(input, ['provider_id', 'model_key', 'draft']);
      return {
        provider_id: requestId(value.provider_id),
        model_key: requestId(value.model_key),
        draft: parseModelDraft(value.draft),
      };
    },
    toRequest: (providerId: string, modelKey: string, draft: SpeechProviderModelDraft) => ({
      provider_id: providerId,
      model_key: modelKey,
      draft,
    }),
  }),
  'speech-provider-model-remove': operation<
    { provider_id: string; model_key: string },
    SpeechProvider
  >()({
    rendererMethod: 'speechProviderModelRemove',
    validate: (input) => {
      const value = requestRecord(input, ['provider_id', 'model_key']);
      return { provider_id: requestId(value.provider_id), model_key: requestId(value.model_key) };
    },
    toRequest: (providerId: string, modelKey: string) => ({
      provider_id: providerId,
      model_key: modelKey,
    }),
  }),
} as const;
