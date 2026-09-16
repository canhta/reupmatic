import { parseProcessingRecipe, parseModelFingerprints } from '../../../core/processing/recipe.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import { app, dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FolderMonitor, within } from '../../../core/folders/folder-monitor.js';
import type { BatchQueue } from '../../../core/batch/batch-queue.js';
import type { FolderSnapshot } from '../../../core/folders/folder-types.js';
import { RemoteError } from '../../../core/worker/remote-error.js';

interface Host {
  wire(name: string, handler: (input: unknown) => unknown): void;
  getWindow(): BrowserWindow;
  getLanguage(): string;
  workspace: string;
  queue?: BatchQueue;
  worker: WorkerClient;
  originalPaths: Set<string>;
}
function record(input: unknown, fields: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !fields.includes(key))) throw new RemoteError('INVALID_REQUEST');
  return input as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value)) throw new RemoteError('INVALID_REQUEST');
  return value;
}

/** Development-only entry until real Plus verification exists. The renderer
 * cannot turn this flag on, submit paths, pick a shell command, or grant itself Plus.
 */
export async function installFolders(host: Host): Promise<FolderMonitor | undefined> {
  const authorized = () => !app.isPackaged && process.env.REUPMATIC_DEV_AUTOMATION === '1';
  const directories = new Map<string, string>();
  let monitor: FolderMonitor | undefined;
  let problem = 'WATCH_UNAVAILABLE';
  if (host.queue) {
    try {
      const { FolderStore } = await import('../../../core/folders/folder-store.js');
      const store = new FolderStore(path.join(host.workspace, 'folder-intake.sqlite'));
      try {
        monitor = new FolderMonitor(store, host.queue, {
          workspace: host.workspace, authorize: authorized,
          protectSource: filename => host.originalPaths.add(filename),
          attach: async (rule, changed, failed) => {
            let module: typeof import('chokidar');
            try { module = await import('chokidar'); }
            catch { throw new RemoteError('WATCH_COMPONENT_MISSING'); }
            const observer = module.watch(rule.source_dir, {
              ignoreInitial: true, followSymlinks: false, depth: rule.recursive ? 32 : 0,
              awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
              ignored: (filename, stat) => filename !== rule.source_dir && (
                path.basename(filename).startsWith('.') || within(rule.output_dir, filename)
                || (stat?.isFile() === true && !/\.(mp4|mov|mkv|webm|avi)$/i.test(filename))
              ),
            });
            observer.on('add', changed).on('change', changed).on('unlink', changed).on('ready', changed).on('error', failed);
            return { close: () => observer.close() };
          },
        });
        monitor.on('changed', (snapshot: FolderSnapshot) => {
          const win = host.getWindow();
          if (win && !win.isDestroyed()) win.webContents.send('reupmatic:folders', snapshot);
        });
        host.queue.on('changed', () => {
          monitor?.notifyQueue();
        });
      } catch (error) { store.close(); throw error; }
    } catch (error) { problem = error instanceof RemoteError ? error.code : 'WATCH_UNAVAILABLE'; }
  }
  const required = () => { if (!monitor) throw new RemoteError(problem); return monitor; };
  const allowed = () => { required(); if (!authorized()) throw new RemoteError('AUTOMATION_UNAVAILABLE'); };
  const pick = async (kind: 'source' | 'output') => {
    allowed();
    const vi = host.getLanguage() === 'vi';
    const title = kind === 'source' ? vi ? 'Chọn thư mục theo dõi' : 'Choose watched folder' : vi ? 'Chọn thư mục xuất' : 'Choose output folder';
    const selected = await dialog.showOpenDialog(host.getWindow(), { title, properties: ['openDirectory', ...(kind === 'output' ? ['createDirectory' as const] : [])] });
    if (selected.canceled) return null;
    if (directories.size >= 100) throw new RemoteError('SELECTION_LIMIT');
    const canonical = await fs.realpath(selected.filePaths[0]);
    if (!(await fs.stat(canonical)).isDirectory()) throw new RemoteError('WATCH_FOLDER_MISSING');
    const directoryId = randomUUID(); directories.set(directoryId, canonical);
    return { directory_id: directoryId, name: canonical };
  };
  host.wire('folder-snapshot', () => required().snapshot());
  host.wire('folder-pick-source', () => pick('source'));
  host.wire('folder-pick-output', () => pick('output'));
  host.wire('folder-create', async input => {
    allowed(); const data = record(input, ['source_id', 'output_id', 'include_existing', 'recursive', 'processing']);
    const source = directories.get(id(data.source_id)); const output = directories.get(id(data.output_id));
    if (!source || !output || typeof data.include_existing !== 'boolean' || typeof data.recursive !== 'boolean') throw new RemoteError('INVALID_REQUEST');
    const processing = data.processing === undefined ? undefined : parseProcessingRecipe(data.processing);
    const processing_models = processing ? parseModelFingerprints(
      await host.worker.request('models.resolve', { processing }).result, processing) : undefined;
    return required().create({ source_dir: source, output_dir: output, include_existing: data.include_existing,
      recursive: data.recursive, ...(processing ? { processing, processing_models } : {}) });
  });
  host.wire('folder-start', input => { allowed(); return required().start(id(record(input, ['rule_id']).rule_id)); });
  host.wire('folder-pause', input => required().pause(id(record(input, ['rule_id']).rule_id)));
  return monitor;
}
