import { installLibraryAssets } from './assets/ipc.js';
import { LibraryAssets } from '../../../core/library/library-assets.js';
import { restoreProjectSnapshot } from '../projects/dependencies.js';
import type { Composition } from '../../../core/editing/composition/document.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import { dialog, shell, type BrowserWindow } from 'electron';
import { lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadProject } from '../../../core/projects/project.js';
import type { LibraryService } from '../../../core/library/library-service.js';
import type { LibraryImportOptions, LibraryImportResult, LibraryItem, LibraryLinkKind } from '../../../core/library/library-types.js';
import type { RegisteredVideo } from '../../../core/media/media-types.js';
import { errorCode, requestId, requestRecord, type IpcWire } from '../../runtime/ipc.js';
import { MediaRegistry, videoFilters } from '../media/registry.js';

interface Host {
  wire: IpcWire;
  getWindow(): BrowserWindow;
  getLanguage?(): string;
  workspace: string;
  media: MediaRegistry;
  worker: WorkerClient;
  pendingJobs(item: LibraryItem): number;
  relatedRecords?(id: string): { posts: number; pending_posts: number; workflows: number };
}

export async function installLibrary(host: Host) {
  let service: LibraryService<RegisteredVideo> | undefined;
  let failure = 'LIBRARY_UNAVAILABLE';
  let importing: Promise<LibraryImportResult | null> | undefined;
  let cancelled = false;
  let closing = false;
  const links = new Set<Promise<unknown>>();

  function trackLink<T>(operation: () => Promise<T>): Promise<T> {
    if (closing) return Promise.reject(new Error('APP_CLOSING'));
    const pending = operation();
    links.add(pending);
    return pending.finally(() => { links.delete(pending); });
  }
  try {
    await mkdir(host.workspace, { recursive: true });
    const { LibraryStore } = await import('../../../core/library/library-store.js');
    const { LibraryService: Service } = await import('../../../core/library/library-service.js');
    const store = new LibraryStore(path.join(host.workspace, 'library.sqlite'));
    service = new Service(store, path.join(host.workspace, 'library-originals'), filename => host.media.registerVideo(filename));
    for (const filename of store.protectedPaths()) host.media.originalPaths.add(filename);
  } catch (error) {
    const code = errorCode(error);
    failure = code === 'WORKER_FAILURE' ? 'LIBRARY_UNAVAILABLE' : code;
  }

  function required(): LibraryService<RegisteredVideo> {
    if (!service || closing) throw new Error(closing ? 'APP_CLOSING' : failure);
    return service;
  }

  function changed() {
    const window = host.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('reupmatic:library-changed');
  }

  async function importFiles(options: LibraryImportOptions): Promise<LibraryImportResult | null> {
    const library = required();
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile', 'multiSelections'], filters: videoFilters,
    });
    if (chosen.canceled) return null;
    if (chosen.filePaths.length > 100) throw new Error('SELECTION_LIMIT');
    const result: LibraryImportResult = { items: [], rejected: [], cancelled: false };
    const notify = (completed: number, name: string, phase: 'importing' | 'complete' | 'cancelled') => {
      const window = host.getWindow();
      if (!window.isDestroyed()) window.webContents.send('reupmatic:library-import', {
        completed, total: chosen.filePaths.length, name, phase,
      });
    };
    for (const filename of chosen.filePaths) {
      if (cancelled || closing) break;
      const name = path.basename(filename);
      notify(result.items.length + result.rejected.length, name, 'importing');
      try {
        const imported = await library.importFile(filename, options);
        host.media.originalPaths.add(imported.item.path);
        result.items.push(imported);
      } catch (error) { result.rejected.push({ name, code: errorCode(error) }); }
    }
    result.cancelled = cancelled || closing;
    notify(result.items.length + result.rejected.length, '', result.cancelled ? 'cancelled' : 'complete');
    changed();
    return result;
  }

  installLibraryAssets(host, () => required().store, changed);

  host.wire('library-list', input => {
    const value = requestRecord(input, ['search', 'offset', 'limit']);
    if (typeof value.search !== 'string' || typeof value.offset !== 'number'
      || typeof value.limit !== 'number') throw new Error('INVALID_REQUEST');
    return required().store.list({ search: value.search, offset: Number(value.offset), limit: Number(value.limit) });
  });
  host.wire('library-import', async input => {
    if (importing) throw new Error('LIBRARY_BUSY');
    const value = requestRecord(input, ['mode', 'duplicates']);
    if ((value.mode !== 'reference' && value.mode !== 'copy')
      || (value.duplicates !== 'reuse' && value.duplicates !== 'separate')) throw new Error('INVALID_REQUEST');
    cancelled = false;
    importing = importFiles({ mode: value.mode, duplicates: value.duplicates });
    try { return await importing; }
    finally { importing = undefined; }
  });
  host.wire('library-cancel-import', () => {
    cancelled = true;
    return { requested: Boolean(importing) };
  });
  async function resolve(id: string): Promise<RegisteredVideo> {
    try {
      const source = await required().resolve(id);
      const item = required().store.get(id);
      const associated = host.media.associateLibrary(source.asset_id, id, item.name);
      return { ...associated, name: item.name };
    } finally { changed(); }
  }
  host.wire('library-open', async input => {
    const id = requestId(requestRecord(input, ['item_id']).item_id);
    return host.media.publicVideo(await resolve(id));
  });
  host.wire('library-open-project', async input => {
    const value = requestRecord(input, ['item_id', 'link_id']);
    const id = requestId(value.item_id);
    const item = required().store.get(id);
    const linked = item.links.find(link => link.id === requestId(value.link_id) && link.kind === 'project');
    if (!linked) throw new Error('INVALID_REQUEST');
    await new LibraryAssets(required().store).resolve(id, linked.id);
    const project = await loadProject(linked.path);
    let source: RegisteredVideo;
    const anchor = item.sha256 === project.source.sha256 ? item : required().store.findContent(project.source.sha256);
    if (anchor) source = await resolve(anchor.id);
    else {
      const chosen = await dialog.showOpenDialog(host.getWindow(), { properties: ['openFile'], filters: videoFilters,
        title: host.getLanguage?.() === 'vi' ? 'Chọn video gốc của project' : 'Choose the project source video',
        defaultPath: project.source.path.startsWith('\\\\') ? undefined : project.source.path });
      if (chosen.canceled) return null;
      source = await host.media.registerVideo(chosen.filePaths[0]);
    }
    const snapshot = await restoreProjectSnapshot(host.media, host.getWindow(), project, source, host.getLanguage?.());
    await new LibraryAssets(required().store).resolve(id, linked.id);
    return snapshot ? { media: host.media.publicVideo(source), snapshot } : null;
  });
  host.wire('library-relink', async input => {
    const id = requestId(requestRecord(input, ['item_id']).item_id);
    required().store.get(id);
    const chosen = await dialog.showOpenDialog(host.getWindow(), { properties: ['openFile'], filters: videoFilters });
    if (chosen.canceled) return null;
    const item = await required().relink(id, chosen.filePaths[0]);
    host.media.originalPaths.add(item.path);
    changed();
    return item;
  });
  host.wire('library-dependencies', input => {
    const id = requestId(requestRecord(input, ['item_id']).item_id);
    const item = required().store.get(id);
    return { item, pending_jobs: host.pendingJobs(item), known_links_only: true,
      ...(host.relatedRecords?.(id) ?? { posts: 0, pending_posts: 0, workflows: 0 }) };
  });
  host.wire('library-forget', input => {
    const id = requestId(requestRecord(input, ['item_id']).item_id);
    const item = required().store.get(id);
    const related = host.relatedRecords?.(id);
    if (host.pendingJobs(item) || related?.pending_posts || related?.workflows) throw new Error('LIBRARY_IN_USE');
    required().store.forget(id);
    changed();
    return { removed: true };
  });
  host.wire('library-reveal', async input => {
    const value = requestRecord(input, ['item_id', 'link_id']);
    const item = required().store.get(requestId(value.item_id));
    const filename = value.link_id === undefined ? item.path
      : item.links.find(link => link.id === requestId(value.link_id))?.path;
    if (!filename || !(await lstat(filename).catch(() => null))?.isFile()) throw new Error('SOURCE_UNAVAILABLE');
    shell.showItemInFolder(filename);
    return { revealed: true };
  });

  return {
    get active() { return Boolean(importing) || links.size > 0; },
    get service() { return service; },
    resolve,
    recordBatchOutput(itemId: string, sha256: string, filename: string, outputHash: string) {
      return trackLink(async () => {
      if (!service) return;
      let item: LibraryItem;
      try { item = service.store.get(itemId); }
      catch (error) { if (errorCode(error) === 'LIBRARY_ITEM_MISSING') return; throw error; }
      if (item.sha256 !== sha256) throw new Error('SOURCE_CHANGED');
      await new LibraryAssets(service.store).register(itemId, 'export', filename, outputHash);
      changed();
      });
    },
    recordCompositionLinks(composition: Composition, kind: 'project' | 'export', filename: string): Promise<boolean> {
      return trackLink(async () => {
        if (!service) return false;
        let linked = true;
        for (const sha256 of new Set(composition.clips.map(clip => clip.source.sha256))) {
          const item = service.store.findContent(sha256);
          if (!item) continue;
          try { await new LibraryAssets(service.store).register(item.id, kind, filename); }
          catch { linked = false; }
        }
        changed();
        return linked;
      }).catch(() => false);
    },
    recordLink(source: RegisteredVideo | undefined, kind: LibraryLinkKind, filename: string): Promise<boolean> {
      return trackLink(async () => {
      if (!source?.library_id || !service) return false;
      try {
        await new LibraryAssets(service.store).register(source.library_id, kind, filename);
        changed();
        return true;
      } catch { return false; }
      }).catch(() => false);
    },
    beginClose() { closing = true; cancelled = true; },
    async close() {
      closing = true;
      cancelled = true;
      await importing?.catch(() => undefined);
      await Promise.allSettled([...links]);
      service?.store.close();
    },
  };
}
