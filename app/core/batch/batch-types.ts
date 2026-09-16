import type { ProcessingRecipe, ModelFingerprints } from '../processing/recipe.js';
/** Shared serializable batch data. No renderer-supplied file paths or commands. */
export type BatchState = 'queued' | 'running' | 'cancelling' | 'interrupted' | 'complete' | 'failed' | 'cancelled';
export interface FileIdentity { path: string; sha256: string; name: string; }
export interface BatchJobInput {
  video: FileIdentity;
  library_id?: string;
  processing?: ProcessingRecipe;
  processing_models?: ModelFingerprints;
  subtitle?: FileIdentity;
  output_dir: string;
  encoding: 'review';
}
export interface BatchOutput { path: string; sha256: string; duration_ms: number; cache_hit: boolean; }
export interface BatchJob {
  id: string;
  batch_id: string;
  position: number;
  state: BatchState;
  attempt: number;
  input: BatchJobInput;
  output: BatchOutput | null;
  error_code: string | null;
  created_at: number;
  updated_at: number;
}
export interface BatchItemView {
  id: string;
  batch_id: string;
  name: string;
  subtitle_name: string | null;
  processing?: ProcessingRecipe;
  state: BatchState;
  attempt: number;
  error_code: string | null;
  output_name: string | null;
  progress: { phase: string; fraction: number | null } | null;
}
export interface BatchSnapshot {
  version: number;
  paused: boolean;
  active_id: string | null;
  recovered: number;
  fault: string | null;
  items: BatchItemView[];
}
export interface BatchDraft { draft_key: string; asset_id: string; name: string; duration_ms: number; subtitle_id?: string; subtitle_name?: string; }
export interface BatchSelection { items: BatchDraft[]; rejected: { name: string; code: string }[]; }
export interface BatchSubmit {
  request_id: string;
  processing?: ProcessingRecipe;
  output_id: string;
  items: { asset_id: string; subtitle_id?: string }[];
}
