import { parseProcessingRecipe, parseModelFingerprints } from '../../../core/processing/recipe.js';
import { dialog, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { VideoSource } from '../../../core/media/media-types.js';
import { BatchQueue } from '../../../core/batch/batch-queue.js';
import type { BatchDraft, BatchJob, BatchJobInput, BatchSelection, BatchSnapshot, FileIdentity } from '../../../core/batch/batch-types.js';
import type { RenderCoordinator } from '../../../core/rendering/render-coordinator.js';
import { RemoteError } from '../../../core/worker/remote-error.js';
import { type WorkerClient } from '../../../core/worker/worker-client.js';

type Wire = (name: string, handler: (input: any) => Promise<unknown> | unknown) => void;
interface Host {
  wire: Wire;
  getWindow(): BrowserWindow;
  getLanguage(): string;
  worker: WorkerClient;
  renderer: RenderCoordinator;
  workspace: string;
  originalPaths: Set<string>;
  defaultDirectory?(): string | undefined;
  resolveLibrary?(id: string): Promise<VideoSource>;
  onCompleted?(job: BatchJob): Promise<void> | void;
}
function stableCode(error: unknown): string {
  return error instanceof RemoteError ? error.code
    : error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'SOURCE_UNAVAILABLE';
}
function record(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) throw new RemoteError('INVALID_REQUEST');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value)) throw new RemoteError('INVALID_REQUEST');
  return value;
}

/** Narrow authorized-picker IPC. File paths never arrive from the renderer.
 * Missing SQLite is isolated to batch: the individual Editor can still open.
 */
export async function installBatch(host: Host): Promise<BatchQueue | undefined> {
  let queue: BatchQueue | undefined;
  let initializationError = 'QUEUE_UNAVAILABLE';
  const videos = new Map<string, FileIdentity>();
  const subtitles = new Map<string, FileIdentity>();
  const libraryIds = new Map<string, string>();
  const indexed = new Set<string>();
  const indexing = new Set<string>();
  const directories = new Map<string, string>();
  try {
    await fs.mkdir(host.workspace, { recursive: true });
    const { BatchStore } = await import('../../../core/batch/batch-store.js');
    const store = new BatchStore(path.join(host.workspace, 'batch.sqlite'));
    try {
      const saved = store.list();
      queue = new BatchQueue(store, host.worker, host.renderer);
      for (const job of saved) {
        host.originalPaths.add(job.input.video.path);
        if (job.input.subtitle) host.originalPaths.add(job.input.subtitle.path);
      }
    } catch (error) { store.close(); throw error; }
    queue.on('changed', snapshot => {
      indexCompleted(snapshot);
      const win = host.getWindow();
      if (win && !win.isDestroyed()) win.webContents.send('reupmatic:batch', snapshot);
    });
  } catch (error) { initializationError = error instanceof RemoteError ? error.code : 'QUEUE_UNAVAILABLE'; }
  const required = (): BatchQueue => { if (!queue) throw new RemoteError(initializationError); return queue; };
  const file = async (filename: string, kind: 'video' | 'subtitle'): Promise<{ id: string; identity: FileIdentity }> => {
    const canonical = await fs.realpath(filename);
    const data = await host.worker.request('asset.register', { path: canonical, kind }).result;
    if (typeof data.asset_id !== 'string' || typeof data.sha256 !== 'string') throw new RemoteError('INVALID_WORKER_RESPONSE');
    const identity = { path: canonical, name: path.basename(canonical), sha256: data.sha256 };
    host.originalPaths.add(canonical);
    return { id: data.asset_id, identity };
  };
  function indexCompleted(snapshot: BatchSnapshot) {
    for (const item of snapshot.items) {
      if (item.state !== 'complete' || indexed.has(item.id) || indexing.has(item.id)) continue;
      indexing.add(item.id);
      void Promise.resolve().then(() => host.onCompleted?.(required().get(item.id)))
        .then(() => { indexed.add(item.id); })
        .catch(() => { /* Retry indexing from the durable queue on a later snapshot. */ })
        .finally(() => { indexing.delete(item.id); });
    }
  }
  host.wire('batch-snapshot', () => {
    const snapshot = required().snapshot();
    indexCompleted(snapshot);
    return snapshot;
  });
  host.wire('batch-pick-videos', async (): Promise<BatchSelection | null> => {
    required();
    const selected = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi'] }],
    });
    if (selected.canceled) return null;
    if (selected.filePaths.length > 100 || videos.size + selected.filePaths.length > 2000) throw new RemoteError('SELECTION_LIMIT');
    const result: BatchSelection = { items: [], rejected: [] };
    const seen = new Set<string>();
    for (const filename of selected.filePaths) {
      try {
        const source = await file(filename, 'video');
        if (seen.has(source.identity.path)) continue;
        seen.add(source.identity.path);
        const info = await host.worker.request('media.probe', { asset_id: source.id }).result;
        if (!Number.isInteger(info.duration_ms) || Number(info.duration_ms) <= 0) throw new RemoteError('INVALID_MEDIA');
        videos.set(source.id, source.identity);
        const draft: BatchDraft = {
          draft_key: createHash('sha256').update(source.identity.path).digest('hex'),
          asset_id: source.id, name: source.identity.name, duration_ms: Number(info.duration_ms),
        };
        result.items.push(draft);
      } catch (error) { result.rejected.push({ name: path.basename(filename), code: stableCode(error) }); }
    }
    return result;
  });
  host.wire('batch-from-library', async input => {
    required();
    const data = record(input, ['item_ids']);
    if (!Array.isArray(data.item_ids) || !data.item_ids.length || data.item_ids.length > 100
      || !host.resolveLibrary || videos.size + data.item_ids.length > 2000) {
      throw new RemoteError('INVALID_REQUEST');
    }
    const result: BatchSelection = { items: [], rejected: [] };
    for (const libraryId of new Set(data.item_ids.map(identifier))) {
      try {
        const source = await host.resolveLibrary(libraryId);
        const assetId = randomUUID();
        videos.set(assetId, { path: source.path, name: source.name, sha256: source.sha256 });
        libraryIds.set(assetId, libraryId);
        host.originalPaths.add(source.path);
        result.items.push({ asset_id: assetId, name: source.name, duration_ms: source.duration_ms,
          draft_key: createHash('sha256').update(source.path).digest('hex') });
      } catch (error) { result.rejected.push({ name: libraryId, code: stableCode(error) }); }
    }
    return result;
  });
  host.wire('batch-pick-subtitle', async () => {
    required();
    if (subtitles.size >= 2000) throw new RemoteError('SELECTION_LIMIT');
    const selected = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'], filters: [{ name: 'SubRip', extensions: ['srt'] }],
    });
    if (selected.canceled) return null;
    const source = await file(selected.filePaths[0], 'subtitle');
    subtitles.set(source.id, source.identity);
    return { subtitle_id: source.id, subtitle_name: source.identity.name };
  });
  host.wire('batch-pick-directory', async () => {
    required();
    const selected = await dialog.showOpenDialog(host.getWindow(), {
      title: host.getLanguage() === 'vi' ? 'Chọn thư mục xuất video' : 'Choose output folder',
      properties: ['openDirectory', 'createDirectory'], defaultPath: host.defaultDirectory?.(),
    });
    if (selected.canceled) return null;
    if (directories.size >= 100) throw new RemoteError('SELECTION_LIMIT');
    const directory = await fs.realpath(selected.filePaths[0]);
    if (!(await fs.stat(directory)).isDirectory()) throw new RemoteError('OUTPUT_DIRECTORY_MISSING');
    const outputId = randomUUID(); directories.set(outputId, directory);
    return { output_id: outputId, name: directory };
  });
  host.wire('batch-enqueue', async input => {
    const data = record(input, ['request_id', 'output_id', 'items', 'processing']);
    const requestId = identifier(data.request_id);
    if (requestId.startsWith('watch_')) throw new RemoteError('INVALID_REQUEST');
    const directory = directories.get(identifier(data.output_id));
    if (!directory || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 100) throw new RemoteError('INVALID_REQUEST');
    const processing = data.processing === undefined ? undefined : parseProcessingRecipe(data.processing);
    const requests: BatchJobInput[] = data.items.map(value => {
      const item = record(value, ['asset_id', 'subtitle_id']);
      const video = videos.get(identifier(item.asset_id));
      const subtitle = item.subtitle_id === undefined ? undefined : subtitles.get(identifier(item.subtitle_id));
      if (!video || (item.subtitle_id !== undefined && !subtitle)) throw new RemoteError('UNKNOWN_ASSET');
      if (processing) parseProcessingRecipe(processing, Boolean(subtitle));
      return { video, ...(subtitle ? { subtitle } : {}), output_dir: directory, encoding: 'review',
        ...(libraryIds.has(String(item.asset_id)) ? { library_id: libraryIds.get(String(item.asset_id)) } : {}) };
    });
    if (processing) {
      const resolved = await host.worker.request('models.resolve', { processing }).result;
      const processing_models = parseModelFingerprints(resolved, processing);
      for (const request of requests) Object.assign(request, { processing, processing_models });
    }
    return required().enqueue(requestId, requests);
  });
  host.wire('batch-pause', () => required().pause());
  host.wire('batch-resume', () => required().resume());
  host.wire('batch-cancel', input => required().cancel(identifier(record(input, ['job_id']).job_id)));
  host.wire('batch-retry', input => required().retry(identifier(record(input, ['job_id']).job_id)));
  host.wire('batch-reveal', async input => {
    const job = required().get(identifier(record(input, ['job_id']).job_id));
    if (job.state !== 'complete' || !job.output) throw new RemoteError('JOB_STATE');
    const info = await fs.lstat(job.output.path).catch(() => { throw new RemoteError('OUTPUT_MISSING'); });
    if (!info.isFile() || info.isSymbolicLink()) throw new RemoteError('OUTPUT_MISSING');
    shell.showItemInFolder(job.output.path);
    return { revealed: true };
  });
  return queue;
}
