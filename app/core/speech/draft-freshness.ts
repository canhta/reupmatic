// A recognised draft stays applicable while its source media and target layer are unchanged.
// Unrelated edits (style, audio, other layers) must not invalidate it.

export interface SpeechDraftSource {
  documentId: string;
  assetId: string;
  /** JSON of the target layer's cues when the draft was captured. */
  targetCues: string;
}

export interface SpeechReviewState {
  documentId: string;
  assetId: string;
  composed: boolean;
  targetCues: string;
}

export function speechDraftFresh(draft: SpeechDraftSource, current: SpeechReviewState): boolean {
  return (
    !current.composed &&
    draft.documentId === current.documentId &&
    draft.assetId === current.assetId &&
    draft.targetCues === current.targetCues
  );
}
