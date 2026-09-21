import { randomUUID } from 'node:crypto';
import { lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { type BrowserWindow, dialog, shell } from 'electron';
import type { DiagnosticRecorder } from '../../../core/diagnostics/recorder.js';
import type { Composition } from '../../../core/editing/composition/document.js';
import type { ContentLibrary, ProbedOriginal } from '../../../core/library/content-library.js';
import { localMediaKindForExtension } from '../../../core/library/content-source.js';
import type { DouyinTag } from '../../../core/library/douyin/intake-contracts.js';
import type {
  ContentAssetKind,
  ContentEntry,
  OriginalImportOptions,
  OriginalImportResult,
} from '../../../core/library/library-contracts.js';
import type { RegisteredVideo } from '../../../core/media/media-contracts.js';
import { loadProject } from '../../../core/projects/project.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import { errorCode, type IpcWire } from '../../runtime/ipc.js';
import { localImportFilters, type MediaRegistry, videoFilters } from '../media/registry.js';
import { restoreProjectSnapshot } from '../projects/dependencies.js';
import { installLibraryAssets } from './assets/ipc.js';

interface Host {
  wire: IpcWire;
  diagnostics?: DiagnosticRecorder;
  getWindow(): BrowserWindow;
  getLanguage?(): string;
  workspace: string;
  media: MediaRegistry;
  worker: WorkerClient;
  pendingJobs(item: ContentEntry): number;
  relatedRecords?(id: string): { posts: number; pending_posts: number; workflows: number };
  contentLabels?(): { id: string; label_ids: string[] }[];
  assignTags?(contentId: string, tags: readonly DouyinTag[]): void;
}

async function inspectLocalOriginal(
  media: MediaRegistry,
  filename: string,
): Promise<ProbedOriginal> {
  const kind = localMediaKindForExtension(path.extname(filename));
  if (kind === 'video') return { media_kind: 'video', ...(await media.registerVideo(filename)) };
  if (kind === 'audio') {
    const { source } = await media.registerAudio(filename);
    return {
      media_kind: 'audio',
      path: source.path,
      name: source.name,
      sha256: source.sha256,
      duration_ms: source.duration_ms,
    };
  }
  if (kind === 'subtitle') {
    return { media_kind: 'subtitle', ...(await media.registerSubtitle(filename)) };
  }
  throw new Error('INVALID_MEDIA');
}

export async function installLibrary(host: Host) {
  const coversRoot = path.join(host.workspace, 'library-covers');
  let contentLibrary: ContentLibrary | undefined;
  let failure = 'LIBRARY_UNAVAILABLE';
  let importing: Promise<OriginalImportResult | null> | undefined;
  let cancelled = false;
  let closing = false;
  const links = new Set<Promise<unknown>>();

  function trackLink<T>(operation: () => Promise<T>): Promise<T> {
    if (closing) return Promise.reject(new Error('APP_CLOSING'));
    const pending = operation();
    links.add(pending);
    return pending.finally(() => {
      links.delete(pending);
    });
  }
  try {
    await mkdir(host.workspace, { recursive: true });
    const { ContentLibrary: Library } = await import('../../../core/library/content-library.js');
    contentLibrary = new Library(
      path.join(host.workspace, 'library.sqlite'),
      path.join(host.workspace, 'library-originals'),
      {
        inspectOriginal: (filename) => inspectLocalOriginal(host.media, filename),
        inspectReferences: (content) => ({
          pending_jobs: host.pendingJobs(content),
          ...(host.relatedRecords?.(content.id) ?? { posts: 0, pending_posts: 0, workflows: 0 }),
        }),
        // Covers come from FFmpeg; only a video has a poster, others record 'unavailable'.
        generateCover: async (content) => {
          if (content.media_kind !== 'video') throw new Error('COVER_UNAVAILABLE');
          const asset = await host.media.registerVideo(content.path);
          await mkdir(coversRoot, { recursive: true });
          const ticket = host.worker.request('media.poster', {
            asset_id: asset.asset_id,
            output_path: path.join(coversRoot, `${content.id}.jpg`),
          });
          return (await ticket.result).cover_path;
        },
        contentLabels: () => host.contentLabels?.() ?? [],
        // Omitted when the host has no taxonomy, so an intake with tags fails loudly.
        ...(host.assignTags ? { assignTags: host.assignTags } : {}),
      },
    );
    for (const filename of contentLibrary.protectedPaths()) host.media.originalPaths.add(filename);
  } catch (error) {
    const code = errorCode(error);
    failure = code === 'WORKER_FAILURE' ? 'LIBRARY_UNAVAILABLE' : code;
    host.diagnostics?.record({
      level: 'error',
      source: { process: 'main', module: 'library' },
      event: 'library.unavailable',
      code: failure,
      message: error instanceof Error ? error.message : undefined,
    });
  }

  function required(): ContentLibrary {
    if (!contentLibrary || closing) throw new Error(closing ? 'APP_CLOSING' : failure);
    return contentLibrary;
  }

  function changed() {
    const window = host.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('reupmatic:library-changed');
  }

  async function importFiles(options: OriginalImportOptions): Promise<OriginalImportResult | null> {
    const library = required();
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: localImportFilters,
    });
    if (chosen.canceled) return null;
    if (chosen.filePaths.length > 100) throw new Error('SELECTION_LIMIT');
    const result: OriginalImportResult = { items: [], rejected: [], cancelled: false };
    const notify = (
      completed: number,
      name: string,
      phase: 'importing' | 'complete' | 'cancelled',
    ) => {
      const window = host.getWindow();
      if (!window.isDestroyed())
        window.webContents.send('reupmatic:library-import', {
          completed,
          total: chosen.filePaths.length,
          name,
          phase,
        });
    };
    for (const filename of chosen.filePaths) {
      if (cancelled || closing) break;
      const name = path.basename(filename);
      notify(result.items.length + result.rejected.length, name, 'importing');
      try {
        const imported = await library.importOriginal(filename, options);
        host.media.originalPaths.add(imported.item.path);
        result.items.push(imported);
      } catch (error) {
        result.rejected.push({ name, code: errorCode(error) });
      }
    }
    result.cancelled = cancelled || closing;
    notify(
      result.items.length + result.rejected.length,
      '',
      result.cancelled ? 'cancelled' : 'complete',
    );
    changed();
    return result;
  }

  installLibraryAssets(host, required, changed);

  host.wire('library-list', (input) => {
    const page = required().listContent(input);
    // Renderer CSP forbids file://, so publish covers through media://; read-only.
    for (const item of page.items) {
      if (item.cover_state === 'ready' && item.cover_path) {
        host.media.registerCover(item.id, item.cover_path);
      }
    }
    return page;
  });
  host.wire('library-import', async (input) => {
    if (importing) throw new Error('LIBRARY_BUSY');
    cancelled = false;
    importing = importFiles(input);
    try {
      return await importing;
    } finally {
      importing = undefined;
    }
  });
  host.wire('library-cancel-import', () => {
    cancelled = true;
    return { requested: Boolean(importing) };
  });
  async function resolve(id: string): Promise<RegisteredVideo> {
    try {
      const { content, source } = await required().resolveOriginal(id);
      if (source.media_kind !== 'video') throw new Error('LIBRARY_OPEN_UNSUPPORTED');
      const associated = source.asset_id
        ? host.media.associateLibrary(source.asset_id, id, content.name)
        : await host.media.registerVideo(content.path, id);
      return { ...associated, name: content.name };
    } finally {
      changed();
    }
  }
  host.wire('library-open', async (input) => host.media.publicVideo(await resolve(input.item_id)));
  host.wire('library-add-media', async (input) => {
    const video = await resolve(input.item_id);
    return {
      id: randomUUID(),
      kind: 'video' as const,
      path: video.path,
      name: video.name,
      sha256: video.sha256,
      duration_ms: video.duration_ms,
    };
  });
  host.wire('library-open-project', async (input) => {
    const { item_id: id, link_id: linkId } = input;
    const item = required().getContent(id);
    const linked = item.links.find((link) => link.id === linkId && link.kind === 'project');
    if (!linked) throw new Error('INVALID_REQUEST');
    await required().resolveAsset(id, linked.id);
    const project = await loadProject(linked.path);
    let source: RegisteredVideo;
    const anchor =
      item.sha256 === project.source.sha256 ? item : required().findContent(project.source.sha256);
    if (anchor) source = await resolve(anchor.id);
    else {
      const chosen = await dialog.showOpenDialog(host.getWindow(), {
        properties: ['openFile'],
        filters: videoFilters,
        title:
          host.getLanguage?.() === 'vi'
            ? 'Chọn video gốc của project'
            : 'Choose the project source video',
        defaultPath: project.source.path.startsWith('\\\\') ? undefined : project.source.path,
      });
      if (chosen.canceled) return null;
      source = await host.media.registerVideo(chosen.filePaths[0]);
    }
    const snapshot = await restoreProjectSnapshot(
      host.media,
      host.getWindow(),
      project,
      source,
      host.getLanguage?.(),
    );
    await required().resolveAsset(id, linked.id);
    return snapshot
      ? { media: host.media.publicVideo(source), snapshot, project_path: linked.path }
      : null;
  });
  host.wire('library-relink', async (input) => {
    const { item_id: id } = input;
    required().getContent(id);
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters: localImportFilters,
    });
    if (chosen.canceled) return null;
    const item = await required().relinkOriginal(id, chosen.filePaths[0]);
    host.media.originalPaths.add(item.path);
    changed();
    return item;
  });
  host.wire('library-dependencies', (input) => required().dependencies(input.item_id));
  host.wire('library-forget', (input) => {
    required().removeContent(input.item_id);
    changed();
    return { removed: true };
  });
  host.wire('library-reveal', async (input) => {
    const item = required().getContent(input.item_id);
    const filename =
      input.link_id === undefined
        ? item.path
        : item.links.find((link) => link.id === input.link_id)?.path;
    if (!filename || !(await lstat(filename).catch(() => null))?.isFile())
      throw new Error('SOURCE_UNAVAILABLE');
    shell.showItemInFolder(filename);
    return { revealed: true };
  });

  return {
    get activeCount() {
      return Number(Boolean(importing)) + links.size;
    },
    get contentLibrary() {
      return contentLibrary;
    },
    resolve,
    recordBatchOutput(itemId: string, sha256: string, filename: string, outputHash: string) {
      return trackLink(async () => {
        if (!contentLibrary) return;
        await contentLibrary.registerBatchExport(itemId, sha256, filename, outputHash);
        changed();
      });
    },
    recordCompositionLinks(
      composition: Composition,
      kind: 'project' | 'export',
      filename: string,
    ): Promise<boolean> {
      return trackLink(async () => {
        if (!contentLibrary) return false;
        const linked = await contentLibrary.registerCompositionAsset(composition, kind, filename);
        changed();
        return linked;
      }).catch(() => false);
    },
    recordLink(
      source: RegisteredVideo | undefined,
      kind: ContentAssetKind,
      filename: string,
    ): Promise<boolean> {
      return trackLink(async () => {
        if (!source?.library_id || !contentLibrary) return false;
        try {
          await contentLibrary.registerAsset(source.library_id, kind, filename);
          changed();
          return true;
        } catch {
          return false;
        }
      }).catch(() => false);
    },
    beginClose() {
      closing = true;
      cancelled = true;
    },
    async close() {
      closing = true;
      cancelled = true;
      await importing?.catch(() => undefined);
      await Promise.allSettled([...links]);
      contentLibrary?.close();
    },
  };
}
