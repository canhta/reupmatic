import type { PublicVideo } from '../../../core/media/media-types';

export type Media = PublicVideo;

export interface Capabilities {
  ffmpeg: boolean;
  pysubs2: boolean;
  ocr: boolean;
  inpainting: boolean;
}

export interface Preview {
  artifact_id: string;
  url: string;
  revision: number;
}

export interface SubtitlePreview {
  revision: number;
  text: string;
}
