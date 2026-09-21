import { createHash } from 'node:crypto';
import { RemoteError } from '../worker/remote-error.js';
import type { SpeechEngineStatus, SpeechLanguage } from './recognition.js';

const LANGUAGES: readonly SpeechLanguage[] = ['en', 'vi', 'zh'];
// The local path's own bound (`worker/speech/recognition/service.py` MAX_DURATION). A hosted
// provider's model declares its *own, shorter* bound (D-55/spec "Duration bounds") — never this
// one, and never unbounded — so a hosted max must sit strictly below it.
const LOCAL_DURATION_CEILING_MS = 7200000;

/**
 * Wire protocols this app can actually speak to a hosted endpoint. A **protocol** is code
 * (D-55): the app implements a known, named set, and a provider naming anything outside it is
 * refused at configuration time, plainly, never accepted and failed later at run time.
 * `dashscope` (ticket 06, spec slice 5) is the first entry — its wire shape lives in
 * `worker/speech/recognition/hosted.py`, dispatched to by `worker/speech/recognition/hosted_runner.py`,
 * a child separate from the local inference child. DashScope is one protocol among however many
 * follow: nothing here, the contracts or the UI treats it as *the* hosted engine. Adding a
 * protocol later is exactly one entry here plus its adapter, never a config toggle.
 */
export const IMPLEMENTED_PROTOCOLS: ReadonlySet<string> = new Set<string>(['dashscope']);

// The hosted identity digest's adapter-version component (spec "Model identity"). Fixed at 1
// since DashScope's wire contract (ticket 06) is the first one it versions; bumping it is how a
// future breaking change to that contract invalidates every identity computed under the old one,
// exactly as the local engines' `identity_fields.adapter` already does.
const ADAPTER_VERSION = 1;

/** The environment variable name a hosted child receives its provider's credential through
 * (D-55/ticket 06): never the on-disk job file, which lands in the workspace. Shared, hand-
 * synced literal on the Python side (`worker/speech/recognition/hosted_runner.py`), the same
 * pattern `app/core/worker/error-codes.ts` already uses for the worker's error vocabulary. */
export const HOSTED_CREDENTIAL_ENV_VAR = 'REUPMATIC_SPEECH_PROVIDER_CREDENTIAL';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
function shortText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0')
  );
}

export interface SpeechProviderDraft {
  display_name: string;
  protocol: string;
  endpoint_host: string;
}

export interface SpeechProviderModelDraft {
  remote_model_name: string;
  languages: SpeechLanguage[];
  max_duration_ms: number;
}

export interface SpeechProviderModel extends SpeechProviderModelDraft {
  id: string;
  /** 64-hex identity digest: protocol, adapter version, remote model name, endpoint host. No
   * bundle, so no file hashes — this is the same identity concept `model_id` already is for a
   * local engine, computed a different way because there is nothing on disk to hash. */
  model_id: string;
}

export interface SpeechProvider extends SpeechProviderDraft {
  id: string;
  /** Never the credential itself — only whether one is currently stored. A stored credential is
   * never echoed back to any interface (spec "Providers, models and credentials"). */
  has_credential: boolean;
  models: SpeechProviderModel[];
}

/** Shape-and-policy validation for a provider draft: an unimplemented protocol is refused here,
 * at configuration time, with a plain reason — never accepted and failed later at run time. */
export function parseProviderDraft(value: unknown): SpeechProviderDraft {
  if (
    !isPlainRecord(value) ||
    !exactKeys(value, ['display_name', 'protocol', 'endpoint_host']) ||
    !shortText(value.display_name, 128) ||
    !shortText(value.protocol, 64) ||
    !shortText(value.endpoint_host, 255) ||
    value.endpoint_host.includes('/') ||
    value.endpoint_host.includes(' ')
  ) {
    throw new RemoteError('INVALID_REQUEST');
  }
  return {
    display_name: value.display_name,
    protocol: value.protocol,
    endpoint_host: value.endpoint_host,
  };
}

/** Refuses a protocol the app does not implement, plainly and at configuration time. Takes the
 * implemented set explicitly (defaulting to the real registry) so a test can exercise the
 * accept path before any protocol adapter exists to accept for real. */
export function assertProtocolImplemented(
  protocol: string,
  implemented: ReadonlySet<string> = IMPLEMENTED_PROTOCOLS,
): void {
  if (!implemented.has(protocol)) throw new RemoteError('SPEECH_PROTOCOL_UNKNOWN');
}

export function parseModelDraft(value: unknown): SpeechProviderModelDraft {
  if (
    !isPlainRecord(value) ||
    !exactKeys(value, ['remote_model_name', 'languages', 'max_duration_ms']) ||
    !shortText(value.remote_model_name, 128) ||
    !Array.isArray(value.languages) ||
    value.languages.length < 1 ||
    value.languages.length > 3 ||
    new Set(value.languages).size !== value.languages.length ||
    value.languages.some((language) => !LANGUAGES.includes(language as SpeechLanguage)) ||
    typeof value.max_duration_ms !== 'number' ||
    !Number.isInteger(value.max_duration_ms) ||
    value.max_duration_ms < 1000 ||
    value.max_duration_ms >= LOCAL_DURATION_CEILING_MS
  ) {
    throw new RemoteError('INVALID_REQUEST');
  }
  return {
    remote_model_name: value.remote_model_name,
    languages: value.languages as SpeechLanguage[],
    max_duration_ms: value.max_duration_ms,
  };
}

/** The hosted-model identity digest: protocol, adapter version, remote model name and endpoint
 * host — no bundle, so no file hashes. Keeps the 64-hex shape every existing validator (core and
 * worker) already checks; nothing about that shape changes for this ticket. */
export function hostedModelIdentity(input: {
  protocol: string;
  remote_model_name: string;
  endpoint_host: string;
}): string {
  const payload = {
    protocol: input.protocol,
    adapter_version: ADAPTER_VERSION,
    remote_model_name: input.remote_model_name,
    endpoint_host: input.endpoint_host,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Renders configured hosted providers as engine-list entries, in the same shape a local engine
 * reports (spec "the engine list stays one list"). `available` reflects only whether the app
 * still implements the provider's protocol — never whether a credential is present, exactly as
 * the worker's own `available` never encodes Free/Plus/credits. Credential gating happens only
 * in `engine-capability.ts`'s `presentableSpeechEngines`, the one seam that does it.
 */
export function hostedEngineEntries(
  providers: readonly SpeechProvider[],
  implemented: ReadonlySet<string> = IMPLEMENTED_PROTOCOLS,
): SpeechEngineStatus[] {
  const entries: SpeechEngineStatus[] = [];
  for (const provider of providers) {
    const available = implemented.has(provider.protocol);
    for (const model of provider.models) {
      entries.push({
        engine: `${provider.id}:${model.id}`,
        available,
        code: available ? null : 'SPEECH_PROTOCOL_UNKNOWN',
        model_id: model.model_id,
        languages: model.languages,
        verified: false,
      });
    }
  }
  return entries;
}

export interface HostedModelLookup {
  provider: SpeechProvider;
  model: SpeechProviderModel;
}

/**
 * Finds the hosted provider/model claiming a request's `model_id`, or `null` when none does —
 * the identity names a local bundle instead (or nothing configured at all; the worker's own
 * `SPEECH_MODEL_CHANGED` is what speaks to that case). Re-checks the provider's protocol against
 * `implemented` even though `addProvider`/`updateProvider` already refused an unimplemented one
 * at configuration time: defence in depth for a provider stored before a protocol this build no
 * longer implements was removed. Never inspects a credential — that stays `SpeechProviderStore`'s
 * job (`has_credential`, `credentialEnv`), the one place a decrypted secret is ever read back.
 */
export function resolveHostedModel(
  providers: readonly SpeechProvider[],
  modelId: string,
  implemented: ReadonlySet<string> = IMPLEMENTED_PROTOCOLS,
): HostedModelLookup | null {
  for (const provider of providers) {
    const model = provider.models.find((candidate) => candidate.model_id === modelId);
    if (model) {
      assertProtocolImplemented(provider.protocol, implemented);
      return { provider, model };
    }
  }
  return null;
}
