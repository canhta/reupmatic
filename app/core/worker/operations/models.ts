import type { ModelState, ModelStatus } from '../../vision/vision.js';
import type { OperationEntry } from '../operation-contract.js';
import { RemoteError } from '../remote-error.js';
import { resultBoolean, resultObject, resultString } from '../result-validation.js';

function modelState(value: unknown): ModelState {
  const state = resultObject(value);
  const languages = state.languages;
  if (!Array.isArray(languages) || languages.some((language) => typeof language !== 'string')) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  resultBoolean(state, 'available');
  resultBoolean(state, 'verified');
  if (state.code !== null) resultString(state, 'code');
  return state as unknown as ModelState;
}

function validateModelStatus(data: unknown): ModelStatus {
  const value = resultObject(data);
  modelState(value.ocr);
  modelState(value.inpainting);
  return value as unknown as ModelStatus;
}

export interface ModelConfigureResult extends Record<string, unknown> {
  configured: boolean;
  models: ModelStatus;
}

function validateModelConfigureResult(data: unknown): ModelConfigureResult {
  const value = resultObject(data);
  resultBoolean(value, 'configured');
  validateModelStatus(value.models);
  return value as unknown as ModelConfigureResult;
}

/** Keyed by `inpainting` and/or `ocr_<language>`; not a fixed field set. */
export type ModelResolveResult = Record<string, string>;

function validateModelResolveResult(data: unknown): ModelResolveResult {
  const value = resultObject(data);
  for (const fingerprint of Object.values(value)) {
    if (typeof fingerprint !== 'string') throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return value as ModelResolveResult;
}

export const modelOperations = {
  'models.status': { method: 'models.status', kind: 'instant', validate: validateModelStatus },
  'models.configure': {
    method: 'models.configure',
    kind: 'queued',
    validate: validateModelConfigureResult,
  },
  'models.merge': {
    method: 'models.merge',
    kind: 'queued',
    validate: validateModelConfigureResult,
  },
  'models.unconfigure': {
    method: 'models.unconfigure',
    kind: 'queued',
    validate: validateModelConfigureResult,
  },
  'models.resolve': {
    method: 'models.resolve',
    kind: 'queued',
    validate: validateModelResolveResult,
  },
} as const satisfies Record<string, OperationEntry<unknown>>;
