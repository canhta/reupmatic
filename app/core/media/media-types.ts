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
