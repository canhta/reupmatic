import { createHash } from 'node:crypto';
import { RemoteError } from '../worker/remote-error.js';
import type { SpeechEngineStatus, SpeechLanguage } from './recognition.js';

const LANGUAGES: readonly SpeechLanguage[] = ['en', 'vi', 'zh'];
// A hosted provider's declared max must sit strictly below the local worker's own bound.
const LOCAL_DURATION_CEILING_MS = 7200000;

export const IMPLEMENTED_PROTOCOLS: ReadonlySet<string> = new Set<string>(['dashscope', 'vieneu']);

// The hosted synthesis engine shares the provider store with recognition, BYOK and never proxied.
export const VIEU_CLOUD_PROTOCOL = 'vieneu';
export const VIEU_CLOUD_MODEL = 'vieneu-v4';
export const VIEU_CLOUD_HOST = 'api.vieneu.io';

export function vieuCloudModelId(endpointHost: string = VIEU_CLOUD_HOST): string {
  return hostedModelIdentity({
    protocol: VIEU_CLOUD_PROTOCOL,
    remote_model_name: VIEU_CLOUD_MODEL,
    endpoint_host: endpointHost,
  });
}

const ADAPTER_VERSION = 1;

// Credential is passed via env, never the on-disk job file; hand-synced with Python.
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
  model_id: string;
}

export interface SpeechProvider extends SpeechProviderDraft {
  id: string;
  /** True/false only; the credential itself is never echoed back. */
  has_credential: boolean;
  models: SpeechProviderModel[];
}

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
