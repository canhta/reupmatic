import path from 'node:path';
import { parseModelFingerprints, parseReusableRecipe } from '../processing/recipe.js';
import { RemoteError } from '../worker/remote-error.js';
import type { BatchJobInput, FileIdentity } from './batch-contracts.js';

const SHA256 = /^[a-f0-9]{64}$/;

export function isSha256(value: string): boolean {
  return SHA256.test(value);
}

function validFile(value: FileIdentity): boolean {
  return (
    !!value &&
    typeof value.path === 'string' &&
    path.isAbsolute(value.path) &&
    value.path.length <= 32768 &&
    !value.path.includes('\0') &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= 1024 &&
    typeof value.sha256 === 'string' &&
    isSha256(value.sha256)
  );
}

export function validateBatchInput(value: BatchJobInput): void {
  if (value?.processing !== undefined) {
    const recipe = parseReusableRecipe(value.processing, Boolean(value.subtitle));
    parseModelFingerprints(value.processing_models, recipe);
  } else if (value?.processing_models !== undefined) {
    throw new RemoteError('INVALID_PROCESSING_MODELS');
  }
  if (
    !value ||
    (value.library_id !== undefined &&
      (typeof value.library_id !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value.library_id))) ||
    !validFile(value.video) ||
    (value.subtitle !== undefined && !validFile(value.subtitle)) ||
    typeof value.output_dir !== 'string' ||
    !path.isAbsolute(value.output_dir) ||
    value.output_dir.includes('\0') ||
    value.output_dir.length > 32768 ||
    value.encoding !== 'review'
  ) {
    throw new RemoteError('INVALID_REQUEST');
  }
}
