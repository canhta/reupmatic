import type { EditorSnapshot } from '../project.js';
import type { PublicVideo } from '../../media/media-types.js';

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
}
export interface RecoveryIdentity { id: string; expected_revision: number }
export interface RecoveryOpened { media: PublicVideo; snapshot: EditorSnapshot }
