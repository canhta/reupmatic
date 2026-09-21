import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app, type BrowserWindow, dialog } from 'electron';
import type { BatchQueue } from '../../../core/batch/batch-queue.js';
import type { DiagnosticRecorder } from '../../../core/diagnostics/recorder.js';
import type { FolderSnapshot } from '../../../core/folders/folder-contracts.js';
import { FolderIntake, within } from '../../../core/folders/folder-intake.js';
import { parseModelFingerprints } from '../../../core/processing/recipe.js';
import { RemoteError } from '../../../core/worker/remote-error.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import type { IpcWire } from '../../runtime/ipc.js';

interface Host {
  wire: IpcWire;
  diagnostics?: DiagnosticRecorder;
  getWindow(): BrowserWindow;
  getLanguage(): string;
  workspace: string;
  queue?: BatchQueue;
  worker: WorkerClient;
  originalPaths: Set<string>;
}

/** Dev-only entry until real Plus verification; the renderer cannot grant itself Plus. */
export async function installFolders(host: Host): Promise<FolderIntake | undefined> {
  const authorized = () => !app.isPackaged && process.env.REUPMATIC_DEV_AUTOMATION === '1';
  const directories = new Map<string, string>();
  let intake: FolderIntake | undefined;
  let problem = 'WATCH_UNAVAILABLE';
  if (host.queue) {
    try {
      intake = new FolderIntake(host.queue, {
        databasePath: path.join(host.workspace, 'folder-intake.sqlite'),
        workspace: host.workspace,
        authorize: authorized,
        protectSource: (filename) => host.originalPaths.add(filename),
        attach: async (rule, changed, failed) => {
          let module: typeof import('chokidar');
          try {
            module = await import('chokidar');
          } catch {
            throw new RemoteError('WATCH_COMPONENT_MISSING');
          }
          const observer = module.watch(rule.source_dir, {
            ignoreInitial: true,
            followSymlinks: false,
            depth: rule.recursive ? 32 : 0,
            awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
            ignored: (filename, stat) =>
              filename !== rule.source_dir &&
              (path.basename(filename).startsWith('.') ||
                within(rule.output_dir, filename) ||
                (stat?.isFile() === true && !/\.(mp4|mov|mkv|webm|avi)$/i.test(filename))),
          });
          observer
            .on('add', changed)
            .on('change', changed)
            .on('unlink', changed)
            .on('ready', changed)
            .on('error', failed);
          return { close: () => observer.close() };
        },
      });
      intake.on('changed', (snapshot: FolderSnapshot) => {
        const win = host.getWindow();
        if (win && !win.isDestroyed()) win.webContents.send('reupmatic:folders', snapshot);
      });
      host.queue.on('changed', () => {
        intake?.notifyQueue();
      });
    } catch (error) {
      problem = error instanceof RemoteError ? error.code : 'WATCH_UNAVAILABLE';
      host.diagnostics?.record({
        level: 'error',
        source: { process: 'main', module: 'folders' },
        event: 'folders.watch-unavailable',
        code: problem,
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }
  const required = () => {
    if (!intake) throw new RemoteError(problem);
    return intake;
  };
  const allowed = () => {
    required();
    if (!authorized()) throw new RemoteError('AUTOMATION_UNAVAILABLE');
  };
  const pick = async (kind: 'source' | 'output') => {
    allowed();
    const vi = host.getLanguage() === 'vi';
    const title =
      kind === 'source'
        ? vi
          ? 'Chọn thư mục theo dõi'
          : 'Choose watched folder'
        : vi
          ? 'Chọn thư mục xuất'
          : 'Choose output folder';
    const selected = await dialog.showOpenDialog(host.getWindow(), {
      title,
      properties: ['openDirectory', ...(kind === 'output' ? ['createDirectory' as const] : [])],
    });
    if (selected.canceled) return null;
    if (directories.size >= 100) throw new RemoteError('SELECTION_LIMIT');
    const canonical = await fs.realpath(selected.filePaths[0]);
    if (!(await fs.stat(canonical)).isDirectory()) throw new RemoteError('WATCH_FOLDER_MISSING');
    const directoryId = randomUUID();
    directories.set(directoryId, canonical);
    return { directory_id: directoryId, name: canonical };
  };
  host.wire('folder-snapshot', () => required().snapshot());
  host.wire('folder-pick-source', () => pick('source'));
  host.wire('folder-pick-output', () => pick('output'));
  host.wire('folder-create', async (input) => {
    allowed();
    const source = directories.get(input.source_id);
    const output = directories.get(input.output_id);
    if (!source || !output) throw new RemoteError('INVALID_REQUEST');
    const { processing } = input;
    const processing_models = processing
      ? parseModelFingerprints(
          await host.worker.request('models.resolve', { processing }).result,
          processing,
        )
      : undefined;
    return required().create({
      source_dir: source,
      output_dir: output,
      include_existing: input.include_existing,
      recursive: input.recursive,
      ...(processing ? { processing, processing_models } : {}),
    });
  });
  host.wire('folder-start', (input) => {
    allowed();
    return required().start(input.rule_id);
  });
  host.wire('folder-pause', (input) => required().pause(input.rule_id));
  return intake;
}
