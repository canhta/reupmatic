import type { OcrResult } from './vision.js';
/**
 * Never apply a result to another source or over edits to the displayed layer. Style, crop and
 * other layers may change during a long scan without invalidating it; the layer token changes only
 * when the displayed text, language or origin changes.
 */
export function canApplyOcr(
  draft: OcrResult,
  capturedLayerToken: string,
  assetId: string,
  currentLayerToken: string,
): boolean {
  return draft.asset_id === assetId && capturedLayerToken === currentLayerToken;
}
