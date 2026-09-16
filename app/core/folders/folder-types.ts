import type { ModelFingerprints, ProcessingRecipe } from '../processing/recipe.js';
/** Folder intake shares the existing batch queue. No arbitrary renderer paths. */
export interface FolderConfig {
  processing?: ProcessingRecipe;
  processing_models?: ModelFingerprints;
  source_dir: string;
  output_dir: string;
  include_existing: boolean;
  recursive: boolean;
}
export interface FolderRule extends FolderConfig {
  id: string;
  initialized: boolean;
  created_at: number;
}
export interface FolderEntry {
  path: string;
  fingerprint: string;
}
export interface FolderRuleView {
  processing?: ProcessingRecipe;
  id: string;
  source_name: string;
  output_name: string;
  include_existing: boolean;
  recursive: boolean;
  initialized: boolean;
  state: 'paused' | 'watching' | 'scanning' | 'needs_attention';
  admitted: number;
  last_scan: number | null;
  error_code: string | null;
  error_file: string | null;
}
export interface FolderSnapshot {
  version: number;
  available: boolean;
  developer_only: boolean;
  queue_paused: boolean;
  rules: FolderRuleView[];
}
export interface FolderCreate {
  processing?: ProcessingRecipe;
  source_id: string;
  output_id: string;
  include_existing: boolean;
  recursive: boolean;
}
