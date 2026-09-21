import type { OperationEntry } from '../operation-contract.js';
import { resultBoolean, resultNumber, resultObject, resultString } from '../result-validation.js';

export interface HelloResult extends Record<string, unknown> {
  protocol: number;
  ffmpeg: boolean;
  pysubs2: boolean;
  ocr: boolean;
  inpainting: boolean;
  durable_jobs: boolean;
}

function validateHelloResult(data: unknown): HelloResult {
  const value = resultObject(data);
  resultNumber(value, 'protocol');
  resultBoolean(value, 'ffmpeg');
  resultBoolean(value, 'pysubs2');
  resultBoolean(value, 'ocr');
  resultBoolean(value, 'inpainting');
  resultBoolean(value, 'durable_jobs');
  return value as HelloResult;
}

export interface CancelResult extends Record<string, unknown> {
  requested: boolean;
  request_id: string;
}

function validateCancelResult(data: unknown): CancelResult {
  const value = resultObject(data);
  resultBoolean(value, 'requested');
  resultString(value, 'request_id');
  return value as CancelResult;
}

export const runtimeOperations = {
  hello: { method: 'hello', kind: 'instant', validate: validateHelloResult },
  cancel: { method: 'cancel', kind: 'instant', validate: validateCancelResult },
} as const satisfies Record<string, OperationEntry<unknown>>;
