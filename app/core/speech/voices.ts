import { RemoteError } from '../worker/remote-error.js';

export type VoiceLanguage = 'en' | 'vi';
export type VoiceSource = 'preset' | 'cloned' | 'cloud';

// Cloning is offered for Turbo only: Nano's encode graphs download on first use, and this build
// never downloads silently. Nano remains preset-only until that becomes an explicit install.
export const CLONING_ENGINES = ['vieneu-v3-turbo-onnx'] as const;
export type CloningEngine = (typeof CLONING_ENGINES)[number];
export const LOCAL_VOICE_ENGINES: readonly string[] = [
  'vieneu-v3-turbo-onnx',
  'vieneu-v3-nano-onnx',
];

export const CLOUD_SYNTHESIS_ENGINE = 'vieneu-v4';

export interface VoiceAttestation {
  /** ISO-8601 UTC instant the user attested they have the right to clone the reference audio. */
  attested_at: string;
}

export interface ClonedVoiceMeta extends VoiceAttestation {
  id: string;
  name: string;
  engine: CloningEngine;
  language: VoiceLanguage;
  source: 'cloned';
  created_at: string;
}

/** The numeric payload the local adapter consumes; never sent to the renderer. */
export interface ClonedVoiceData {
  speaker_emb: number[];
  ref_codes: number[][];
}

export interface VoiceCloneRequest {
  name: string;
  engine: CloningEngine;
  language: VoiceLanguage;
  attested: true;
}

/** One entry of the Editor's voice selector, tagged with its engine and model identity. */
export interface SynthesisVoiceOption {
  id: string;
  label: string;
  source: VoiceSource;
  engine: string;
  model_id: string;
}

const ID_PATTERN = /^cloned_[a-f0-9]{16}$/;
const NAME_LIMIT = 80;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
function namedText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: rejects control characters on purpose
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
function instant(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function newClonedVoiceId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `cloned_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function parseClonedVoiceId(value: unknown): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value))
    throw new RemoteError('INVALID_REQUEST');
  return value;
}

export function parseVoiceName(value: unknown): string {
  if (!namedText(value, NAME_LIMIT)) throw new RemoteError('VOICE_NAME_INVALID');
  return value;
}

export function parseCloningEngine(value: unknown): CloningEngine {
  if (!CLONING_ENGINES.includes(value as CloningEngine))
    throw new RemoteError('SPEECH_CLONE_UNSUPPORTED_ENGINE');
  return value as CloningEngine;
}

export function parseVoiceLanguage(value: unknown): VoiceLanguage {
  if (value !== 'en' && value !== 'vi') throw new RemoteError('INVALID_REQUEST');
  return value;
}

/** A clone request is only admitted when the user has ticked the rights attestation. */
export function parseVoiceCloneRequest(value: unknown): VoiceCloneRequest {
  if (
    !isPlainRecord(value) ||
    !exactKeys(value, ['name', 'engine', 'language', 'attested']) ||
    value.attested !== true
  ) {
    if (isPlainRecord(value) && 'attested' in value && value.attested !== true)
      throw new RemoteError('SPEECH_CLONE_ATTESTATION_REQUIRED');
    throw new RemoteError('INVALID_REQUEST');
  }
  return {
    name: parseVoiceName(value.name),
    engine: parseCloningEngine(value.engine),
    language: parseVoiceLanguage(value.language),
    attested: true,
  };
}

export function parseClonedVoiceMeta(value: unknown): ClonedVoiceMeta {
  if (
    !isPlainRecord(value) ||
    !exactKeys(value, [
      'id',
      'name',
      'engine',
      'language',
      'source',
      'attested_at',
      'created_at',
    ]) ||
    value.source !== 'cloned' ||
    !ID_PATTERN.test(String(value.id)) ||
    !namedText(value.name, NAME_LIMIT) ||
    !CLONING_ENGINES.includes(value.engine as CloningEngine) ||
    (value.language !== 'en' && value.language !== 'vi') ||
    !instant(value.attested_at) ||
    !instant(value.created_at)
  ) {
    throw new RemoteError('SPEECH_VOICE_STORE_INVALID');
  }
  return value as unknown as ClonedVoiceMeta;
}

function embedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 192 &&
    value.some((entry) => entry !== 0) &&
    value.every(
      (entry) => typeof entry === 'number' && Number.isFinite(entry) && Math.abs(entry) <= 1000,
    )
  );
}

function codes(value: unknown): value is number[][] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) return false;
  const width = Array.isArray(value[0]) ? value[0].length : 0;
  if (!Number.isInteger(width) || width < 1 || width > 32) return false;
  return value.every(
    (row) =>
      Array.isArray(row) &&
      row.length === width &&
      row.every((entry) => Number.isInteger(entry) && entry >= 0 && entry < 65536),
  );
}

export function parseClonedVoiceData(value: unknown): ClonedVoiceData {
  if (!isPlainRecord(value) || !exactKeys(value, ['speaker_emb', 'ref_codes']))
    throw new RemoteError('SPEECH_CLONE_INVALID');
  if (!embedding(value.speaker_emb) || !codes(value.ref_codes))
    throw new RemoteError('SPEECH_CLONE_INVALID');
  return { speaker_emb: value.speaker_emb, ref_codes: value.ref_codes };
}

export function buildClonedVoiceMeta(
  request: VoiceCloneRequest,
  id: string,
  now: Date = new Date(),
): ClonedVoiceMeta {
  const at = now.toISOString();
  return {
    id,
    name: request.name,
    engine: request.engine,
    language: request.language,
    source: 'cloned',
    attested_at: at,
    created_at: at,
  };
}
