import type { OcrResult } from './vision.js';
/** Never apply a result to another source or over edits made since submission. */
export function canApplyOcr(
  draft: OcrResult,
  capturedRevision: number,
  assetId: string,
  currentRevision: number,
): boolean {
  return draft.asset_id === assetId && capturedRevision === currentRevision;
}
