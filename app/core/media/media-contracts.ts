export interface VideoSource {
  path: string;
  name: string;
  sha256: string;
  duration_ms: number;
  width: number;
  height: number;
  has_audio: boolean;
}

export interface PublicVideo {
  asset_id: string;
  name: string;
  url: string;
  duration_ms: number;
  width: number;
  height: number;
  has_audio: boolean;
  library_id?: string;
}

export interface RegisteredVideo extends VideoSource {
  asset_id: string;
  library_id?: string;
}

/** Shared by the worker registry and its caller so the shape cannot drift. */
export interface MediaDownloadResult extends Record<string, unknown> {
  path: string;
  bytes: number;
  sha256: string;
  container: string;
  codec: string;
  duration_ms: number;
  width: number;
  height: number;
  /** A ratio string (e.g. "30" or "30000/1001"), not a decimal number. */
  frame_rate: string;
  has_audio: boolean;
  reused: boolean;
  resumed: boolean;
}
