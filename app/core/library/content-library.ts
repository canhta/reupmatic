import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Composition } from '../editing/composition/document.js';
import { hashFile } from '../media/files.js';
import type { VideoSource } from '../media/media-contracts.js';
import { loadProject } from '../projects/project.js';
import type { ContentSource } from './content-source.js';
import { assertContentSource, localMediaKindForExtension } from './content-source.js';
import { assertDouyinIntake } from './douyin/intake.js';
import type { DouyinIntake, DouyinIntakeRecord, DouyinTag } from './douyin/intake-contracts.js';
import type {
  ContentAsset,
  ContentAssetKind,
  ContentAssetPage,
  ContentAssetQuery,
  ContentDependencies,
  ContentEntry,
  ContentOriginDouyin,
  ContentPage,
  ContentQuery,
  OriginalImportOptions,
} from './library-contracts.js';
import { LibraryStore } from './library-store.js';

export type GenerateCover = (content: ContentEntry) => Promise<string>;

export interface ProbedVideoOriginal extends VideoSource {
  media_kind: 'video';
  asset_id?: string;
}

export interface ProbedAudioOriginal {
  media_kind: 'audio';
  path: string;
  name: string;
  sha256: string;
  duration_ms: number;
}

export interface ProbedSubtitleOriginal {
  media_kind: 'subtitle';
  path: string;
  name: string;
  sha256: string;
}

export type ProbedOriginal = ProbedVideoOriginal | ProbedAudioOriginal | ProbedSubtitleOriginal;

function localSource(source: ProbedOriginal, sizeBytes: number): ContentSource {
  const base = {
    path: source.path,
    name: source.name,
    sha256: source.sha256,
    size_bytes: sizeBytes,
    media_kind: source.media_kind,
    origin: { kind: 'local' as const },
  };
  if (source.media_kind === 'video') {
    return {
      ...base,
      video: {
        duration_ms: source.duration_ms,
        width: source.width,
        height: source.height,
        has_audio: source.has_audio,
      },
      audio: null,
    };
  }
  if (source.media_kind === 'audio') {
    return { ...base, video: null, audio: { duration_ms: source.duration_ms } };
  }
  return { ...base, video: null, audio: null };
}

export type InspectOriginal = (filename: string) => Promise<ProbedOriginal>;

export interface ContentReferenceCounts {
  pending_jobs: number;
  posts: number;
  pending_posts: number;
  workflows: number;
}

export type InspectContentReferences = (content: ContentEntry) => ContentReferenceCounts;

export type InspectContentLabelIds = () => { id: string; label_ids: string[] }[];

const noReferences: InspectContentReferences = () => ({
  pending_jobs: 0,
  posts: 0,
  pending_posts: 0,
  workflows: 0,
});

export interface ContentLibraryOptions {
  inspectOriginal: InspectOriginal;
  inspectReferences?: InspectContentReferences;
  generateCover?: GenerateCover;
  contentLabels?: InspectContentLabelIds;
  assignTags?: (contentId: string, tags: readonly DouyinTag[]) => void;
}

export class ContentLibrary {
  readonly #store: LibraryStore;
  private readonly managedRoot: string;
  private readonly inspectOriginal: InspectOriginal;
  private readonly inspectReferences: InspectContentReferences;
  private readonly generateCover?: GenerateCover;
  private readonly listContentLabelIds?: InspectContentLabelIds;
  private readonly assignTags?: (contentId: string, tags: readonly DouyinTag[]) => void;

  constructor(databasePath: string, managedRoot: string, options: ContentLibraryOptions) {
    this.managedRoot = managedRoot;
    this.inspectOriginal = options.inspectOriginal;
    this.inspectReferences = options.inspectReferences ?? noReferences;
    this.generateCover = options.generateCover;
    this.listContentLabelIds = options.contentLabels;
    this.assignTags = options.assignTags;
    this.#store = new LibraryStore(databasePath);
  }

  private async withCover(item: ContentEntry): Promise<ContentEntry> {
    if (!this.generateCover) return this.#store.setCover(item.id, { state: 'unavailable' });
    try {
      const coverPath = await this.generateCover(item);
      return this.#store.setCover(item.id, { path: coverPath, state: 'ready' });
    } catch {
      return this.#store.setCover(item.id, { state: 'unavailable' });
    }
  }

  listContent(query: ContentQuery): ContentPage {
    const { label_ids: labelIds, ...storeQuery } = query;
    if (!labelIds?.length) return this.#store.listContent(storeQuery);
    const wanted = new Set(labelIds);
    const contentIds = (this.listContentLabelIds?.() ?? [])
      .filter((record) => record.label_ids.some((id) => wanted.has(id)))
      .map((record) => record.id);
    return this.#store.listContent(storeQuery, contentIds);
  }

  getContent(id: string): ContentEntry {
    return this.#store.getContent(id);
  }

  findContent(sha256: string): ContentEntry | null {
    return this.#store.findContent(sha256);
  }

  findContentByAwemeId(awemeId: string): ContentEntry | null {
    return this.#store.findContentByAwemeId(awemeId);
  }

  // Validate before the row exists so a malformed projection leaves no half-registered item.
  async registerDouyinContent(
    source: ContentSource & { origin: ContentOriginDouyin },
    intake: DouyinIntake,
    raw: unknown,
  ): Promise<ContentEntry> {
    assertContentSource(source);
    assertDouyinIntake(intake);
    if (source.origin.aweme_id !== intake.awemeId) throw new Error('INVALID_REQUEST');
    const id = randomUUID();
    const item = this.#store.addContent(id, source, 'reference');
    try {
      this.#store.saveDouyinIntake(id, intake, raw);
      if (intake.tags.length > 0 && !this.assignTags) throw new Error('LIBRARY_TAGS_UNAVAILABLE');
      this.assignTags?.(id, intake.tags);
    } catch (error) {
      this.#store.removeContent(id);
      throw error;
    }
    return this.withCover(item);
  }

  saveDouyinIntake(contentId: string, intake: DouyinIntake, raw: unknown): void {
    this.#store.saveDouyinIntake(contentId, intake, raw);
  }

  getDouyinIntake(contentId: string): DouyinIntakeRecord | null {
    return this.#store.getDouyinIntake(contentId);
  }

  async importOriginal(
    filename: string,
    options: OriginalImportOptions,
  ): Promise<{ item: ContentEntry; reused: boolean }> {
    if (
      !options ||
      !['reference', 'copy'].includes(options.mode) ||
      !['reuse', 'separate'].includes(options.duplicates)
    )
      throw new Error('INVALID_REQUEST');
    const source = { ...(await this.inspectOriginal(await realpath(filename))) };
    const duplicate = this.#store.findContent(source.sha256);
    if (duplicate && options.duplicates === 'reuse') return { item: duplicate, reused: true };
    const id = randomUUID();
    let ownedDirectory: string | undefined;
    try {
      if (options.mode === 'copy') {
        await mkdir(this.managedRoot, { recursive: true });
        const root = await realpath(this.managedRoot);
        ownedDirectory = path.join(root, id);
        await mkdir(ownedDirectory);
        const extension = path.extname(source.path).toLowerCase();
        if (!localMediaKindForExtension(extension)) throw new Error('INVALID_MEDIA');
        const target = path.join(ownedDirectory, `source${extension}`);
        await copyFile(source.path, target, constants.COPYFILE_EXCL);
        if (
          (await hashFile(target)) !== source.sha256 ||
          (await hashFile(source.path)) !== source.sha256
        ) {
          throw new Error('SOURCE_CHANGED');
        }
        source.path = target;
      }
      const sizeBytes = (await stat(source.path)).size;
      const item = this.#store.addContent(id, localSource(source, sizeBytes), options.mode);
      return { item: await this.withCover(item), reused: false };
    } catch (error) {
      if (ownedDirectory)
        await rm(ownedDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async resolveOriginal(id: string): Promise<{ content: ContentEntry; source: ProbedOriginal }> {
    const content = this.#store.getContent(id);
    let source: ProbedOriginal;
    try {
      const filename = await realpath(content.path);
      if (!(await stat(filename)).isFile()) throw new Error('SOURCE_UNAVAILABLE');
      source = await this.inspectOriginal(filename);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (
        ['ENOENT', 'EACCES', 'ENOTDIR'].some((value) => code.includes(value)) ||
        code === 'SOURCE_UNAVAILABLE'
      ) {
        this.#store.setAvailability(id, 'missing');
        throw new Error('SOURCE_UNAVAILABLE');
      }
      throw error;
    }
    if (source.sha256 !== content.sha256) {
      this.#store.setAvailability(id, 'changed');
      throw new Error('SOURCE_CHANGED');
    }
    this.#store.setAvailability(id, 'available');
    return { content: this.#store.getContent(id), source };
  }

  async relinkOriginal(id: string, filename: string): Promise<ContentEntry> {
    const content = this.#store.getContent(id);
    const canonical = await realpath(filename);
    const source = { ...(await this.inspectOriginal(canonical)) };
    if (source.sha256 !== content.sha256) throw new Error('SOURCE_CHANGED');
    return this.#store.relinkOriginal(id, localSource(source, (await stat(canonical)).size));
  }

  listAssets(query: ContentAssetQuery): ContentAssetPage {
    return this.#store.listAssets(query);
  }

  async registerAsset(
    contentId: string,
    kind: ContentAssetKind,
    filename: string,
    expectedHash?: string,
  ): Promise<ContentAsset> {
    const content = this.#store.getContent(contentId);
    const canonical = await realpath(filename);
    const before = await stat(canonical);
    if (!before.isFile()) throw new Error('SOURCE_UNAVAILABLE');
    const sha256 = await hashFile(canonical);
    if (kind === 'project') {
      const project = await loadProject(canonical);
      if (
        project.source.sha256 !== content.sha256 &&
        !project.composition?.clips.some((clip) => clip.source.sha256 === content.sha256)
      ) {
        throw new Error('LIBRARY_ASSET_SOURCE');
      }
      if ((await hashFile(canonical)) !== sha256) throw new Error('SOURCE_CHANGED');
    }
    if (expectedHash !== undefined && sha256 !== expectedHash) throw new Error('SOURCE_CHANGED');
    const after = await stat(canonical);
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ino !== before.ino
    ) {
      throw new Error('SOURCE_CHANGED');
    }
    return this.#store.addAsset(contentId, kind, canonical, {
      sha256,
      size_bytes: after.size,
    });
  }

  async resolveAsset(contentId: string, assetId: string): Promise<ContentAsset> {
    const linked = this.#store.getContent(contentId).links.find((asset) => asset.id === assetId);
    if (!linked) throw new Error('LIBRARY_ASSET_MISSING');
    try {
      const before = await stat(linked.path);
      if (!before.isFile()) throw new Error('SOURCE_UNAVAILABLE');
      if (before.size !== linked.size_bytes || (await hashFile(linked.path)) !== linked.sha256) {
        throw new Error('SOURCE_CHANGED');
      }
      const after = await stat(linked.path);
      if (
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ino !== before.ino
      ) {
        throw new Error('SOURCE_CHANGED');
      }
      return linked;
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw new Error('SOURCE_UNAVAILABLE');
      }
      throw error;
    }
  }

  exportChoices(): { library_id: string; export_id: string; content_name: string; name: string }[] {
    return this.#store.exportChoices();
  }

  dependencies(contentId: string): ContentDependencies {
    const item = this.#store.getContent(contentId);
    return { item, known_links_only: true, ...this.inspectReferences(item) };
  }

  removeContent(contentId: string): void {
    const dependencies = this.dependencies(contentId);
    if (dependencies.pending_jobs || dependencies.pending_posts || dependencies.workflows) {
      throw new Error('LIBRARY_IN_USE');
    }
    this.#store.removeContent(contentId);
  }

  async registerBatchExport(
    contentId: string,
    originalHash: string,
    filename: string,
    outputHash: string,
  ): Promise<void> {
    let content: ContentEntry;
    try {
      content = this.#store.getContent(contentId);
    } catch (error) {
      if (error instanceof Error && error.message === 'LIBRARY_ITEM_MISSING') return;
      throw error;
    }
    if (content.sha256 !== originalHash) throw new Error('SOURCE_CHANGED');
    await this.registerAsset(contentId, 'export', filename, outputHash);
  }

  async registerCompositionAsset(
    composition: Composition,
    kind: 'project' | 'export',
    filename: string,
  ): Promise<boolean> {
    let linked = true;
    for (const sha256 of new Set(composition.clips.map((clip) => clip.source.sha256))) {
      const content = this.#store.findContent(sha256);
      if (!content) continue;
      try {
        await this.registerAsset(content.id, kind, filename);
      } catch {
        linked = false;
      }
    }
    return linked;
  }

  protectedPaths(): string[] {
    return this.#store.protectedPaths();
  }

  close(): void {
    this.#store.close();
  }
}
