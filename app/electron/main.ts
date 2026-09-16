import { installSynthesis } from './features/speech/synthesis/ipc.js';
import { installTranslation } from './features/speech/translation/ipc.js';
import { installSpeech } from './features/speech/ipc.js';
import { installRecovery } from './features/projects/recovery.js';
import { installCatalog } from './features/catalog/ipc.js';
import { app, BrowserWindow, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { WorkerClient } from '../core/worker/worker-client.js';
import { RenderCoordinator } from '../core/rendering/render-coordinator.js';
import { renderArtifactPath } from '../core/media/render-artifact.js';
import { PreferencesStore } from '../core/settings/preferences-store.js';
import type { BatchQueue } from '../core/batch/batch-queue.js';
import { installBatch } from './features/batch/ipc.js';
import { installFolders } from './features/folders/ipc.js';
import { installVision } from './features/vision/ipc.js';
import { installLibrary } from './features/library/ipc.js';
import { installSettings } from './features/settings/ipc.js';
import { installEditor } from './features/editor/ipc.js';
import { MediaRegistry } from './features/media/registry.js';
import { createIpcWire, errorCode, requestRecord } from './runtime/ipc.js';
import { installProtocols, registerSchemes } from './runtime/protocols.js';

app.setName('Reupmatic');
if (!app.requestSingleInstanceLock()) app.exit(0);
registerSchemes();

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let win: BrowserWindow;
let dirty = false;
let closing = false;
let confirmingClose = false;
let language: 'en' | 'vi' = 'en';
let batch: BatchQueue | undefined;
let catalog: Awaited<ReturnType<typeof installCatalog>> | undefined;
const wire = createIpcWire(() => win, () => closing);

await app.whenReady();
const workspace = path.join(app.getPath('userData'), 'integration-workspace');
await mkdir(workspace, { recursive: true });
const venvPython = path.join(repo, '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
const python = process.env.PYTHON || await stat(venvPython).then(() => venvPython)
  .catch(() => process.platform === 'win32' ? 'python' : 'python3');
const client = new WorkerClient(python, path.join(repo, 'worker', 'main.py'), workspace);
const media = new MediaRegistry(client);
const renderer = new RenderCoordinator(client);
const recovery = installRecovery({ wire, workspace, media, getWindow: () => win, getLanguage: () => language });
let preferences: PreferencesStore | undefined;
let preferencesError: string | null = null;
try { preferences = await PreferencesStore.open(path.join(workspace, 'preferences.json')); }
catch (error) { preferencesError = errorCode(error); }

const settings = installSettings({ wire, getWindow: () => win, worker: client, preferences, preferencesError });
const synthesis = installSynthesis({ wire, getWindow: () => win, getLanguage: () => language, worker: client, media, workspace, savePath: settings.savePath });
const translation = installTranslation({ wire, getWindow: () => win, getLanguage: () => language, worker: client });
const speech = installSpeech({ wire, getWindow: () => win, getLanguage: () => language, worker: client, media });
const library = await installLibrary({
  wire, getWindow: () => win, getLanguage: () => language, workspace, media, worker: client,
  relatedRecords: id => catalog?.dependencies(id) ?? { posts: 0, pending_posts: 0, workflows: 0 },
  pendingJobs: item => batch?.snapshot().items.filter(view => {
    if (!['queued', 'running', 'cancelling', 'interrupted'].includes(view.state)) return false;
    return batch?.get(view.id).input.video.sha256 === item.sha256;
  }).length ?? 0,
});

renderer.on('job', message => {
  let outgoing = message;
  if (message.event === 'result') {
    const { path: filename, artifact_id: id, source_asset_id: assetId, source_composition: composition, ...data } = message.data;
    try {
      media.registerArtifact(id, renderArtifactPath(workspace, id, filename), assetId, composition);
      outgoing = { ...message, data: { ...data, artifact_id: id, url: `media://local/${id}` } };
    } catch {
      outgoing = { ...message, event: 'error', data: { code: 'INVALID_WORKER_RESPONSE' } };
    }
  }
  if (win && !win.isDestroyed()) win.webContents.send('reupmatic:job', outgoing);
});

installProtocols(path.join(repo, 'dist-ui'), id => media.resolve(id));
installEditor({ wire, getWindow: () => win, getLanguage: () => language,
  worker: client, renderer, media, library, workspace, savePath: settings.savePath });
const vision = installVision({ wire, getWindow: () => win, worker: client, workspace,
  owns: id => media.ownsVideo(id), registerArtifact: (id, filename, assetId) => media.registerArtifact(id, filename, assetId) });
batch = await installBatch({ wire, getWindow: () => win, getLanguage: () => language,
  worker: client, renderer, workspace, originalPaths: media.originalPaths,
  defaultDirectory: settings.defaultDirectory, resolveLibrary: library.resolve,
  onCompleted: async job => {
    if (job.input.library_id && job.output) {
      await library.recordBatchOutput(job.input.library_id, job.input.video.sha256, job.output.path, job.output.sha256);
    }
  },
});
const folders = await installFolders({ wire, getWindow: () => win, getLanguage: () => language,
  workspace, queue: batch, worker: client, originalPaths: media.originalPaths });
catalog = await installCatalog({ wire, workspace, getWindow: () => win, worker: client, queue: batch,
  originalPaths: media.originalPaths, library: () => library.service, resolveLibrary: library.resolve });
wire('dirty', input => {
  const value = requestRecord(input, ['dirty', 'language']);
  if (typeof value.dirty !== 'boolean' || !['en', 'vi'].includes(String(value.language))) throw new Error('INVALID_REQUEST');
  dirty = value.dirty;
  language = value.language === 'vi' ? 'vi' : 'en';
  return null;
});

win = new BrowserWindow({
  title: 'Reupmatic', width: 1420, height: 900, minWidth: 1050, minHeight: 700,
  icon: path.join(repo, 'public', 'icon-192.png'),
  webPreferences: { preload: path.join(repo, 'dist-node', 'electron', 'preload.cjs'),
    contextIsolation: true, nodeIntegration: false, sandbox: true },
});
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
win.webContents.on('will-navigate', event => event.preventDefault());

let closingAttempt = false;
async function closeWorkspace() {
  if (closing || closingAttempt) return;
  closingAttempt = true;
  if (!(await recovery.flush())) {
    const choice = await dialog.showMessageBox(win, { type: 'warning',
      message: language === 'vi'
        ? 'Chưa lưu được bản nháp mới nhất. Thoát vẫn giữ bản nháp đã lưu trước đó, nhưng mất thay đổi mới chưa lưu.'
        : 'The latest draft could not be saved. Quitting retains earlier saved drafts, but loses the newest unsaved changes.',
      buttons: language === 'vi' ? ['Ở lại', 'Thoát không lưu thay đổi mới'] : ['Stay', 'Quit without latest changes'],
      defaultId: 0, cancelId: 0,
    });
    if (choice.response !== 1) { closingAttempt = false; return; }
  }
  closing = true;
  batch?.beginClose();
  library.beginClose();
  await Promise.allSettled([folders?.close(), settings.close()]);
  await Promise.allSettled([renderer.close(), vision.close(), speech.close(), translation.close(), synthesis.close()]);
  await wire.drain();
  recovery.close();
  await catalog?.close();
  await library.close();
  await client.stop().catch(() => undefined);
  try { await batch?.finishClose(); } finally { win.destroy(); }
}

win.on('close', event => {
  if (closing) return;
  event.preventDefault();
  if (confirmingClose) return;
  if (!(dirty || renderer.activeCount || vision.activeCount || speech.activeCount || translation.activeCount || synthesis.activeCount || batch?.pendingCount
    || folders?.activeCount || library.active || settings.active || catalog?.active)) {
    void closeWorkspace();
    return;
  }
  confirmingClose = true;
  void dialog.showMessageBox(win, {
    type: 'warning',
    message: language === 'vi'
      ? 'Thoát Reupmatic? Bản nháp cục bộ sẽ được lưu trước khi thoát. Hàng đợi được giữ; theo dõi folder và nhập file sẽ dừng.'
      : 'Quit Reupmatic? A local recovery draft will be saved before quitting. The queue is retained; folder monitoring and file intake will stop.',
    buttons: language === 'vi' ? ['Ở lại', 'Thoát'] : ['Stay', 'Quit'], defaultId: 0, cancelId: 0,
  }).then(choice => { if (choice.response === 1) return closeWorkspace(); })
    .finally(() => { confirmingClose = false; });
});
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.on('window-all-closed', () => app.quit());
await win.loadURL('app://ui/index.html');
