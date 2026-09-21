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

/**
 * The `media.download` worker result: the one contract for downloaded bytes, shared by the worker
 * registry (`app/core/worker/operations/media.ts`) and the caller that consumes it, so neither
 * side can drift into a second, slightly different shape.
 */
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
  /** True when a completed destination file was probed instead of re-fetched. */
  reused: boolean;
  /** True when an existing `.part` was continued with a Range request. */
  resumed: boolean;
}
