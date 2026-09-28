import type { PublicVideo } from '../../media/media-contracts.js';
import type { EditorSnapshot } from '../project.js';

export interface RecoverySummary {
  id: string;
  revision: number;
  updated_at: number;
  source_name: string;
  cue_count: number;
  error: string | null;
}
export interface RecoverySave {
  id: string;
  expected_revision: number;
  asset_id: string;
  snapshot: EditorSnapshot;
  /** Project file backing this document, so a recovery save never becomes Save As. */
  project_path?: string;
  /** An older draft whose work this save carries forward, dropped atomically. */
  source_id?: string;
}
export interface RecoveryIdentity {
  id: string;
  expected_revision: number;
}
export interface RecoveryOpened {
  media: PublicVideo;
  snapshot: EditorSnapshot;
  project_path?: string | null;
}
