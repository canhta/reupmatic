import type { ModelStatus } from '../vision/vision.js';

export interface Preferences {
  version: 1;
  revision: number;
  default_output_dir: string | null;
}

export interface SettingsSnapshot {
  preferences: Preferences | null;
  preferences_error: string | null;
  models: ModelStatus | null;
  model_error: string | null;
  model_override: boolean;
  runtime: { node: string; electron: string; platform: string; app: string };
}
