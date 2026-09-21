import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { authorizedCompositionSources } from '../../../core/editing/composition/dependencies.js';
import type { Composition } from '../../../core/editing/composition/document.js';
import {
  type AudioSource,
  DEFAULT_SOUNDTRACK_DUCK,
  parseSoundtrack,
  type Soundtrack,
} from '../../../core/editing/soundtrack.js';
import { LOCAL_MEDIA_EXTENSIONS } from '../../../core/library/content-source.js';
import { libraryCoverAssetId } from '../../../core/library/library-contracts.js';
import type { PublicVideo, RegisteredVideo } from '../../../core/media/media-contracts.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import { requestId } from '../../runtime/ipc.js';

export interface MediaFilter {
  name: string;
  extensions: string[];
}

// Extensions come from core's LOCAL_MEDIA_EXTENSIONS, so the picker can't offer a refused file.
export const videoFilters: MediaFilter[] = [
  { name: 'Video', extensions: [...LOCAL_MEDIA_EXTENSIONS.video] },
];
export const audioFilters: MediaFilter[] = [
  { name: 'Audio', extensions: [...LOCAL_MEDIA_EXTENSIONS.audio] },
];
export const subtitleFilters: MediaFilter[] = [
  { name: 'Subtitles', extensions: [...LOCAL_MEDIA_EXTENSIONS.subtitle] },
];
// Still images are a Project media kind, not a Library import kind.
export const imageFilters: MediaFilter[] = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }];
export const localImportFilters: MediaFilter[] = [
  {
    name: 'All supported media',
    extensions: [
      ...LOCAL_MEDIA_EXTENSIONS.video,
      ...LOCAL_MEDIA_EXTENSIONS.audio,
      ...LOCAL_MEDIA_EXTENSIONS.subtitle,
    ],
  },
  ...videoFilters,
  ...audioFilters,
  ...subtitleFilters,
];
export const editorImportFilters: MediaFilter[] = [...localImportFilters, ...imageFilters];

export interface RegisteredSubtitle {
  asset_id: string;
  name: string;
  path: string;
  sha256: string;
}

export class MediaRegistry {
  readonly originalPaths = new Set<string>();
  private readonly paths = new Map<string, string>();
  private readonly audios = new Map<string, { source: AudioSource; url: string }>();
  private readonly videos = new Map<string, RegisteredVideo>();
  private readonly artifactCompositions = new Map<string, Composition>();
  private readonly artifactSources = new Map<string, string>();

  constructor(private readonly worker: WorkerClient) {}

  async registerVideo(filename: string, libraryId?: string): Promise<RegisteredVideo> {
    const canonical = await realpath(filename);
    const source = await this.worker.request('asset.register', { path: canonical, kind: 'video' })
      .result;
    const assetId = requestId(source.asset_id);
    const info = await this.worker.request('media.probe', { asset_id: assetId }).result;
    if (
      typeof source.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(source.sha256) ||
      !Number.isInteger(info.duration_ms) ||
      Number(info.duration_ms) <= 0 ||
      !Number.isInteger(info.width) ||
      Number(info.width) <= 0 ||
      !Number.isInteger(info.height) ||
      Number(info.height) <= 0 ||
      typeof info.has_audio !== 'boolean'
    )
      throw new Error('INVALID_WORKER_RESPONSE');
    const record: RegisteredVideo = {
      asset_id: assetId,
      name: path.basename(canonical),
      path: canonical,
      sha256: source.sha256,
      duration_ms: Number(info.duration_ms),
      width: Number(info.width),
      height: Number(info.height),
      has_audio: info.has_audio,
      ...(libraryId ? { library_id: libraryId } : {}),
    };
    this.originalPaths.add(canonical);
    this.paths.set(assetId, canonical);
    this.videos.set(assetId, record);
    return record;
  }

  async registerSubtitle(filename: string): Promise<RegisteredSubtitle> {
    const canonical = await realpath(filename);
    const source = await this.worker.request('asset.register', {
      path: canonical,
      kind: 'subtitle',
    }).result;
    const assetId = requestId(source.asset_id);
    if (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256))
      throw new Error('INVALID_WORKER_RESPONSE');
    this.originalPaths.add(canonical);
    return {
      asset_id: assetId,
      name: path.basename(canonical),
      path: canonical,
      sha256: source.sha256,
    };
  }

  /** Registers a logo image; renderer reads it via media:// since the CSP blocks file:. */
  async registerImage(
    filename: string,
  ): Promise<{ asset_id: string; name: string; path: string; sha256: string; url: string }> {
    const canonical = await realpath(filename);
    const source = await this.worker.request('asset.register', { path: canonical, kind: 'image' })
      .result;
    const assetId = requestId(source.asset_id);
    if (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256))
      throw new Error('INVALID_WORKER_RESPONSE');
    this.originalPaths.add(canonical);
    this.paths.set(assetId, canonical);
    return {
      asset_id: assetId,
      name: path.basename(canonical),
      path: canonical,
      sha256: source.sha256,
      url: `media://local/${assetId}`,
    };
  }

  async registerAudio(filename: string): Promise<{ source: AudioSource; url: string }> {
    const canonical = await realpath(filename);
    const asset = await this.worker.request('asset.register', { path: canonical, kind: 'audio' })
      .result;
    const assetId = requestId(asset.asset_id);
    const info = await this.worker.request('audio.probe', { asset_id: assetId }).result;
    const track = parseSoundtrack({
      source: {
        path: canonical,
        name: path.basename(canonical),
        sha256: asset.sha256,
        duration_ms: info.duration_ms,
      },
      mode: 'replace',
      start_ms: 0,
      end_ms: info.duration_ms,
      offset_ms: 0,
      gain_db: 0,
      fade_in_ms: 0,
      fade_out_ms: 0,
      duck: DEFAULT_SOUNDTRACK_DUCK,
      muted: false,
    });
    const record = { source: track.source, url: `media://local/${assetId}` };
    this.originalPaths.add(canonical);
    this.paths.set(assetId, canonical);
    this.audios.set(canonical, record);
    return record;
  }

  authorizeSoundtrack(input: Soundtrack): { url: string } {
    const track = parseSoundtrack(input);
    const record = this.audios.get(track.source.path);
    if (
      !record ||
      record.source.sha256 !== track.source.sha256 ||
      record.source.duration_ms !== track.source.duration_ms
    )
      throw new Error('SOUNDTRACK_UNAUTHORIZED');
    return { url: record.url };
  }

  authorizeComposition(input: Composition): { clips: { id: string; url: string }[] } {
    const grants = authorizedCompositionSources(input, this.videos.values());
    return {
      clips: [...grants].map(([id, source]) => ({ id, url: this.publicVideo(source).url })),
    };
  }

  getVideo(value: unknown): RegisteredVideo {
    const record = this.videos.get(requestId(value));
    if (!record) throw new Error('UNKNOWN_ASSET');
    return record;
  }

  associateLibrary(assetId: string, libraryId: string, name?: string): RegisteredVideo {
    const source = this.getVideo(assetId);
    const updated = { ...source, library_id: libraryId, ...(name ? { name } : {}) };
    this.videos.set(assetId, updated);
    return updated;
  }

  ownsVideo(id: string): boolean {
    return this.videos.has(id);
  }

  publicVideo(record: RegisteredVideo): PublicVideo {
    const { asset_id, name, duration_ms, width, height, has_audio, library_id } = record;
    return {
      asset_id,
      name,
      duration_ms,
      width,
      height,
      has_audio,
      url: `media://local/${asset_id}`,
      ...(library_id ? { library_id } : {}),
    };
  }

  /** Publishes a cover via media://; idempotent, re-registered on each listing. */
  registerCover(contentId: string, filename: string): string {
    const id = libraryCoverAssetId(contentId);
    this.paths.set(id, filename);
    return id;
  }

  registerArtifact(
    id: string,
    filename: string,
    assetId?: string,
    composition?: Composition,
  ): void {
    this.paths.set(id, filename);
    if (composition) this.artifactCompositions.set(id, structuredClone(composition));
    if (assetId) this.artifactSources.set(id, assetId);
  }

  artifactComposition(id: string): Composition | undefined {
    const value = this.artifactCompositions.get(id);
    return value ? structuredClone(value) : undefined;
  }

  artifactSource(id: string): RegisteredVideo | undefined {
    const sourceId = this.artifactSources.get(id);
    return sourceId ? this.videos.get(sourceId) : undefined;
  }

  resolve(id: string): string | undefined {
    return this.paths.get(id);
  }
}
