import { installSynthesis } from './features/speech/synthesis/ipc.js';
import { installTranslation } from './features/speech/translation/ipc.js';
import { installSpeech } from './features/speech/ipc.js';
import { SpeechProviderStore } from './features/speech/provider-store.js';
import { installRecovery } from './features/projects/recovery.js';
import { installCatalog } from './features/catalog/ipc.js';
import { app, BrowserWindow, dialog, nativeTheme, safeStorage } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { WorkerClient } from '../core/worker/worker-client.js';
import { missingBundledPaths, resolveRuntimePaths } from '../core/worker/runtime-paths.js';
import { RenderCoordinator } from '../core/rendering/render-coordinator.js';
import { renderArtifactPath } from '../core/media/render-artifact.js';
import type { BatchQueue } from '../core/batch/batch-queue.js';
import { installBatch } from './features/batch/ipc.js';
import { installFolders } from './features/folders/ipc.js';
import { installDouyinSources } from './features/sources/ipc.js';
import { closeDouyinLoginWindow } from './features/sources/login-window.js';
import { sourcesDiagnostics } from './features/sources/diagnostics.js';
import { installVision } from './features/vision/ipc.js';
import { installLibrary } from './features/library/ipc.js';
import { installSettings } from './features/settings/ipc.js';
import { installEditor } from './features/editor/ipc.js';
import { MediaRegistry } from './features/media/registry.js';
import { createIpcWire } from './runtime/ipc.js';
import { installProtocols, registerSchemes } from './runtime/protocols.js';
import {
  type ConfirmChoice,
  type ConfirmContext,
  type ConfirmKind,
  createWorkspaceLifecycle,
  type Language,
  type WorkspaceLifecycle,
} from './runtime/workspace-lifecycle.js';
import { installDiagnosticIntake } from './runtime/diagnostic-intake.js';
import { createDiagnosticSink, levelFromEnvironment } from './runtime/diagnostic-sink.js';
import { installAutoUpdate } from './runtime/auto-update.js';
import { resolveWindowChrome } from './runtime/window-chrome.js';
import { quitMessages } from './runtime/messages.js';
import { installReactDevTools } from './runtime/react-devtools.js';
import { hardenWindow } from './runtime/window-hardening.js';
import { watchTitleBarOverlay } from './runtime/window-theme.js';
import { buildApplicationMenu } from './menu.js';

function defined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

app.setName('Reupmatic');
if (!app.requestSingleInstanceLock()) app.exit(0);
registerSchemes();

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const studioMark = path.join(repo, 'dist-ui', 'brand', 'studio-mark.svg');
const preloadPath = path.join(repo, 'dist-node', 'electron', 'preload.cjs');
const devServerUrl = process.env.REUPMATIC_DEV_SERVER_URL;
const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : undefined;
let win: BrowserWindow;
let lifecycle: WorkspaceLifecycle;
let batch: BatchQueue | undefined;
let catalog: Awaited<ReturnType<typeof installCatalog>> | undefined;
let library: Awaited<ReturnType<typeof installLibrary>> | undefined;
// D-57 removed the independent Settings window — one BrowserWindow, so this bridge trusts
// requests from it alone now.
// D-61: the one Diagnostic log sink, composed before anything else so a failure during startup
// still leaves evidence. It lives under the OS log directory — never the workspace — so a
// project, profile or workspace export can never sweep it up.
const diagnostics = createDiagnosticSink({
  directory: app.getPath('logs'),
  level: levelFromEnvironment(process.env.REUPMATIC_DIAGNOSTIC_LEVEL),
});
const wire = createIpcWire(() => [win], () => lifecycle.isClosing(), devServerOrigin, diagnostics);
installDiagnosticIntake(wire, diagnostics);
const getLanguage = () => lifecycle.getLanguage();

// Auto-update (ticket 07): only a packaged app checks the GitHub release feed; the renderer is
// told once an update is downloaded and can restart now, otherwise it installs on the next quit.
const autoUpdate = installAutoUpdate({
  packaged: app.isPackaged,
  devServerUrl,
  diagnostics,
  onUpdateDownloaded: (version) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('reupmatic:update-downloaded', { version });
    }
  },
});
wire('app-install-update', () => {
  autoUpdate.install();
  return null;
});

function crashRecord(event: string, detail: Record<string, string | number | boolean | null>) {
  diagnostics.record({ level: 'error', source: { process: 'main', module: 'main' }, event, detail });
}
// The hardest failures are the ones that most need evidence, so these run before any window
// exists and stay installed for the whole process lifetime.
// Records only — never `close()`. The sink appends synchronously, so nothing is buffered to
// flush, and neither hook means the app is going down: closing here muted every later record
// for the rest of the session.
process.on('uncaughtException', error =>
  crashRecord('main.uncaught-exception', { name: error.name, reason: error.message }));
process.on('unhandledRejection', reason =>
  crashRecord('main.unhandled-rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  }));
app.on('render-process-gone', (_event, _contents, details) =>
  crashRecord('main.render-process-gone', { reason: details.reason, exit_code: details.exitCode ?? null }));
app.on('child-process-gone', (_event, details) =>
  crashRecord('main.child-process-gone', { kind: details.type, reason: details.reason, exit_code: details.exitCode ?? null }));

async function start() {
diagnostics.record({
  level: 'info',
  source: { process: 'main', module: 'main' },
  event: 'app.started',
  detail: { app: app.getVersion(), platform: process.platform, arch: process.arch },
});
// Before any window exists, so the extension's renderer hook is in place for the first render.
// A download/load failure (offline, store blocked) must not stop the dev app from starting.
if (devServerUrl) await installReactDevTools().catch(error => console.error(`[devtools] ${error.message}`));
const workspaceDirectory = path.join(app.getPath('userData'), 'integration-workspace');
await mkdir(workspaceDirectory, { recursive: true });
const workspace = await realpath(workspaceDirectory);
// A packaged app bundles its interpreter, worker source and FFmpeg under `resources/`; a dev run
// uses the repo. Resolving this in one pure function keeps the two from being mixed, and a missing
// bundled file is reported rather than silently falling back to the machine's own tools.
const venvPython = path.join(repo, '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
const venvExists = await stat(venvPython).then(() => true).catch(() => false);
const runtimePaths = resolveRuntimePaths({
  packaged: app.isPackaged,
  resources: app.isPackaged ? process.resourcesPath : repo,
  repo,
  platform: process.platform,
  env: process.env,
  venvExists,
});
if (app.isPackaged) {
  const missing = missingBundledPaths(runtimePaths, existsSync);
  if (missing.length > 0) {
    diagnostics.record({
      level: 'error',
      source: { process: 'main', module: 'main' },
      event: 'runtime.bundle-missing',
      code: 'BUNDLED_RUNTIME_MISSING',
      message: missing.join(', '),
    });
    throw new Error(`BUNDLED_RUNTIME_MISSING: ${missing.join(', ')}`);
  }
}
// The worker reads these itself (worker/main.py); setting them before the client spawns keeps the
// bundled FFmpeg the only one used, packaged or not.
if (!process.env.FFMPEG_PATH) process.env.FFMPEG_PATH = runtimePaths.ffmpeg;
if (!process.env.FFPROBE_PATH) process.env.FFPROBE_PATH = runtimePaths.ffprobe;
const client = new WorkerClient(runtimePaths.python, runtimePaths.worker, workspace, diagnostics);
const media = new MediaRegistry(client);
// D-57: Settings is a destination in the one main window now, not a second BrowserWindow —
// its own dialogs (pick-output, pick-models) target `win` directly, same as every other
// feature's IPC install. Installed before Douyin sources: D-62's downloads reuse its default
// download folder (`ensureDefaultDirectory`) rather than a second folder setting.
const settings = await installSettings({
  wire, getWindow: () => win, worker: client, workspace, diagnostics, getLanguage,
});
const douyin = installDouyinSources({
  wire, workspace, worker: client, media, diagnostics, settings,
  library: () => library?.contentLibrary,
  getWindow: () => win,
  getLanguage,
});
const recovery = installRecovery({ wire, workspace, media, getWindow: () => win, getLanguage });
const synthesis = installSynthesis({ wire, getWindow: () => win, getLanguage, worker: client, media, workspace, savePath: settings.savePath });
// The render path admits a project's voice audio through synthesis's own verification, so the
// third audio branch is gated by the exact inspection the save dialog already uses.
const renderer = new RenderCoordinator(client, (track) => synthesis.verifyVoice(track));
const translation = installTranslation({ wire, getWindow: () => win, getLanguage, worker: client });
// Its own directory, never `workspace`: nothing here is a job file the worker reads, and a
// provider's credential (encrypted via `safeStorage`) must never land in the worker's workspace.
const providers = new SpeechProviderStore(
  path.join(app.getPath('userData'), 'speech-providers'),
  safeStorage,
);
const speech = installSpeech({
  wire, getWindow: () => win, getWindows: () => [win], getLanguage,
  worker: client, media, providers, workspace,
  // Shipped catalogue, then an optional user file that adds or overrides entries without a code
  // change (D-56: the catalogue is data). Both are local; neither is fetched from a server.
  cataloguePaths: [
    path.join(repo, 'app', 'core', 'speech', 'catalogue.json'),
    path.join(workspace, 'model-catalogue.json'),
  ],
});
library = await installLibrary({
  wire, getWindow: () => win, getLanguage, workspace, media, worker: client, diagnostics,
  assignTags: (contentId, tags) => {
    if (!catalog) throw new Error('LIBRARY_TAGS_UNAVAILABLE');
    return catalog.assignDouyinTags(contentId, tags);
  },
  relatedRecords: id => catalog?.dependencies(id) ?? { posts: 0, pending_posts: 0, workflows: 0 },
  contentLabels: () => catalog?.listContentLabels() ?? [],
  pendingJobs: item => batch?.snapshot().items.filter(view => {
    if (!['queued', 'running', 'cancelling', 'interrupted'].includes(view.state)) return false;
    return batch?.get(view.id).input.video.sha256 === item.sha256;
  }).length ?? 0,
});
const libraryApi = library;

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
const editorApi = installEditor({ wire, getWindow: () => win, getLanguage,
  worker: client, renderer, media, library, workspace, savePath: settings.savePath,
  onRecentChanged: () => void rebuildMenu() });
const vision = installVision({ wire, getWindow: () => win, worker: client, workspace,
  owns: id => media.ownsVideo(id), registerArtifact: (id, filename, assetId) => media.registerArtifact(id, filename, assetId) });
batch = await installBatch({ wire, getWindow: () => win, getLanguage, diagnostics,
  worker: client, renderer, workspace, originalPaths: media.originalPaths,
  defaultDirectory: settings.defaultDirectory, resolveLibrary: libraryApi.resolve,
  onCompleted: async job => {
    if (job.input.library_id && job.output) {
      await libraryApi.recordBatchOutput(job.input.library_id, job.input.video.sha256, job.output.path, job.output.sha256);
    }
  },
});
const folders = await installFolders({ wire, getWindow: () => win, getLanguage, diagnostics,
  workspace, queue: batch, worker: client, originalPaths: media.originalPaths });
catalog = await installCatalog({ wire, workspace, getWindow: () => win, worker: client, queue: batch, diagnostics,
  originalPaths: media.originalPaths, library: () => libraryApi.contentLibrary, resolveLibrary: libraryApi.resolve });

// macOS dirty-document convention ("Do you want to save the changes you
// made to…? Save / Don't Save / Cancel"), adapted for a session that can
// hold several independent drafts at once (not one named document): the
// question asks about "your changes" rather than naming one. A short
// consequence line only when discarding is a real, reachable choice
// (dirty === true); queue/folder-monitoring mechanics are dropped entirely
// — a RUNNING job gets its own one-line warning instead, appended when it
// applies rather than folded into the save question.
//
// Button order: a macOS `showMessageBox` with 3+ buttons stacks them
// TOP TO BOTTOM in array order, not left-to-right (confirmed against
// electron/electron#36973 — a real interactive screenshot in this sandbox
// kept auto-resolving without a click, so this is a documented-behavior
// verification, not a first-hand screenshot; flagged in the report).
// `cancelId`'s button additionally always moves to the end with a small
// gap, regardless of its array position. Putting Cancel last already
// (index 2) means no reordering happens, giving the native "Save changes?"
// layout every Cocoa app uses: Save (top, defaultId — Return key) / Don't
// Save / a gap / Cancel (bottom, cancelId — Escape key).
async function confirmDialog(
  kind: ConfirmKind,
  lang: Language,
  context: ConfirmContext,
): Promise<ConfirmChoice> {
  const m = quitMessages(lang);
  const runningLine = context.running ? m.runningWork : undefined;
  if (kind === 'recovery-flush-failed') {
    const choice = await dialog.showMessageBox(win, {
      type: 'warning',
      message: m.recoveryFailedTitle,
      detail: [m.recoveryFailedDetail, runningLine].filter(Boolean).join('\n'),
      buttons: [m.recoveryFailedStay, m.recoveryFailedQuit],
      defaultId: 0,
      cancelId: 0,
    });
    return choice.response === 1 ? 'discard' : 'cancel';
  }
  if (!context.dirty) {
    const choice = await dialog.showMessageBox(win, {
      type: 'warning',
      message: m.quitCleanTitle,
      detail: runningLine,
      buttons: [m.quitCleanStay, m.quitCleanQuit],
      defaultId: 0,
      cancelId: 0,
    });
    return choice.response === 1 ? 'save' : 'cancel';
  }
  const choice = await dialog.showMessageBox(win, {
    type: 'warning',
    message: m.quitDirtyTitle,
    detail: [m.quitDirtyDetail, runningLine].filter(Boolean).join('\n'),
    buttons: [m.quitDirtySave, m.quitDirtyDontSave, m.quitDirtyCancel],
    defaultId: 0,
    cancelId: 2,
  });
  return choice.response === 1 ? 'discard' : choice.response === 0 ? 'save' : 'cancel';
}

// Always assigned by this point (installBatch/installCatalog are awaited above); typed as
// optional only because installLibrary's callbacks reference them before that assignment.
const batchQueue = batch as BatchQueue;
const catalogWorkspace = catalog as NonNullable<typeof catalog>;
lifecycle = createWorkspaceLifecycle({
  wire,
  recoveryFlush: () => recovery.flush(),
  confirm: confirmDialog,
  // Rebuilds the native menu on every locale change (NAV-L10N) — the menu has no live binding to
  // the renderer's i18next instance, so this is the only way it ever picks up a switched language.
  onLanguageChange: () => void rebuildMenu(),
  // Mirrors the original closeWorkspace() sequence exactly: the two genuinely concurrent
  // tiers swallow a member's failure and keep going; the solo `catalog`/`library` steps and the
  // drain/recovery-close actions are unguarded, so a failure there stops the sequence before
  // `finalClose` (batch) and the window destroy ever run.
  steps: [
    { kind: 'admission', participants: [batchQueue, library] },
    // Cancel an in-flight download before the session and worker shut down, so a quit never
    // orphans a transfer or leaves it half-committed.
    { kind: 'participants', participants: [douyin.downloads].filter(defined) },
    {
      kind: 'participants',
      participants: [folders, settings, douyin.session, douyin.channels].filter(defined),
    },
    { kind: 'participants', participants: [renderer, vision, speech, translation, synthesis] },
    { kind: 'action', run: () => wire.drain() },
    // D-61: the sink is finalised before the recovery flush, so an earlier step that throws and
    // stops the sequence still leaves a complete Diagnostic log behind.
    { kind: 'action', run: () => { diagnostics.close(); } },
    { kind: 'action', run: () => { recovery.close(); } },
    { kind: 'participant', participant: catalogWorkspace },
    { kind: 'participant', participant: library },
    { kind: 'action', run: () => client.stop().catch(() => undefined) },
  ],
  finalClose: batchQueue,
});

win = new BrowserWindow({
  title: 'Reupmatic', width: 1420, height: 900, minWidth: 1050, minHeight: 700,
  ...resolveWindowChrome(process.platform, nativeTheme.shouldUseDarkColors), backgroundColor: '#080a0d',
  icon: studioMark,
  webPreferences: { preload: preloadPath,
    contextIsolation: true, nodeIntegration: false, sandbox: true },
});
hardenWindow(win, devServerUrl);
const stopWatchingTitleBarOverlay = watchTitleBarOverlay(win, process.platform);
win.on('closed', () => stopWatchingTitleBarOverlay());
// Rebuilds the whole native menu from the current language and Recent (videos/projects) list —
// the one place both onLanguageChange and installEditor's onRecentChanged funnel into, so File >
// Open Recent and every label stay in sync without the menu polling either source itself.
// D-57: the Settings… item now sends 'app.openSettings' over the same menu-command channel
// every other peer-area item uses (see menu.ts) instead of opening a second BrowserWindow, so
// this no longer needs an out-of-band actions object.
async function rebuildMenu() {
  const recent = await editorApi.recentList();
  buildApplicationMenu(win, getLanguage(), recent);
}
await rebuildMenu();
// The Douyin login window (features/sources/login-window.ts) is independent, not a child of
// win, so it does not close automatically when win does; close it explicitly here instead.
win.on('closed', () => closeDouyinLoginWindow(sourcesDiagnostics(diagnostics)));
lifecycle.attach(win);

app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.on('window-all-closed', () => app.quit());
if (devServerUrl) {
  win.webContents.on('console-message', ({ message, lineNumber, sourceId }) =>
    console.log(`[renderer] ${message} (${sourceId}:${lineNumber})`));
  win.webContents.on('did-fail-load', (_event, code, description, url) =>
    console.error(`[renderer] failed to load ${url}: ${description} (${code})`));
  win.webContents.openDevTools({ mode: 'detach' });
}
await win.loadURL(devServerUrl ?? new URL('app://ui/index.html').href);
  // After the window is up, so a check never delays startup. A no-op unless packaged.
  autoUpdate.check();
}

void app.whenReady().then(start);
