import type { OperationEntry } from '../operation-contract.js';
import { RemoteError } from '../remote-error.js';
import { resultObject, resultString } from '../result-validation.js';

export interface AssetRegisterResult extends Record<string, unknown> {
  asset_id: string;
  name: string;
  sha256: string;
  kind: 'video' | 'subtitle' | 'audio' | 'image';
}

export function validateAssetRegisterResult(data: unknown): AssetRegisterResult {
  const value = resultObject(data);
  resultString(value, 'asset_id');
  resultString(value, 'name');
  resultString(value, 'sha256');
  const kind = value.kind;
  if (kind !== 'video' && kind !== 'subtitle' && kind !== 'audio' && kind !== 'image') {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  return value as AssetRegisterResult;
}

export const assetOperations = {
  'asset.register': {
    method: 'asset.register',
    kind: 'queued',
    validate: validateAssetRegisterResult,
  },
} as const satisfies Record<string, OperationEntry<unknown>>;
