import type { SpeechStatus } from '../../speech/recognition.js';
import type { SynthesisStatus } from '../../speech/synthesis/contracts.js';
import type { TranslationStatus } from '../../speech/translation/contracts.js';
import type { OperationEntry } from '../operation-contract.js';
import { resultObject, resultRecord } from '../result-validation.js';

function validateSpeechStatus(data: unknown): SpeechStatus {
  return resultObject(data) as unknown as SpeechStatus;
}

function validateSynthesisStatus(data: unknown): SynthesisStatus {
  return resultObject(data) as unknown as SynthesisStatus;
}

function validateTranslationStatus(data: unknown): TranslationStatus {
  return resultObject(data) as unknown as TranslationStatus;
}

export const speechOperations = {
  'synthesis.status': {
    method: 'synthesis.status',
    kind: 'instant',
    validate: validateSynthesisStatus,
  },
  'translation.status': {
    method: 'translation.status',
    kind: 'instant',
    validate: validateTranslationStatus,
  },
  'speech.status': { method: 'speech.status', kind: 'instant', validate: validateSpeechStatus },
  'speech.configure': {
    method: 'speech.configure',
    kind: 'queued',
    validate: validateSpeechStatus,
  },
  'synthesis.configure': {
    method: 'synthesis.configure',
    kind: 'queued',
    validate: validateSynthesisStatus,
  },
  'synthesis.unconfigure': {
    method: 'synthesis.unconfigure',
    kind: 'queued',
    validate: validateSynthesisStatus,
  },
  'speech.unconfigure': {
    method: 'speech.unconfigure',
    kind: 'queued',
    validate: validateSpeechStatus,
  },
  'translation.configure': {
    method: 'translation.configure',
    kind: 'queued',
    validate: validateTranslationStatus,
  },
  'translation.unconfigure': {
    method: 'translation.unconfigure',
    kind: 'queued',
    validate: validateTranslationStatus,
  },
  'speech.transcribe': { method: 'speech.transcribe', kind: 'queued', validate: resultRecord },
  'speech.translate': { method: 'speech.translate', kind: 'queued', validate: resultRecord },
  'speech.synthesize': { method: 'speech.synthesize', kind: 'queued', validate: resultRecord },
} as const satisfies Record<string, OperationEntry<unknown>>;
