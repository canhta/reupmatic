import { realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app, type BrowserWindow, dialog, shell } from 'electron';
import type { SettingsSnapshot } from '../../../core/settings/settings-contracts.js';
import { UserPreferences } from '../../../core/settings/user-preferences.js';
import type { ModelStatus } from '../../../core/vision/vision.js';
import type { Ticket, WorkerClient } from '../../../core/worker/worker-client.js';
import type { DiagnosticSink } from '../../runtime/diagnostic-sink.js';
import { errorCode, type IpcWire } from '../../runtime/ipc.js';

interface Host {
  wire: IpcWire;
  /** The main window (D-57: Settings is a destination inside it now, not a second
   * `BrowserWindow`) — targets its native dialogs (pick-output, pick-models) and the
   * `models-changed` push below. */
  getWindow(): BrowserWindow | undefined;
  worker: WorkerClient;
  workspace: string;
  /** D-61: Settings → Advanced opens this sink's folder and exports its sanitized bundle. */
  diagnostics?: DiagnosticSink;
  /** Only used to localize `ensureDefaultDirectory`'s own picker title. */
  getLanguage?(): string;
}

export async function installSettings(host: Host) {
  let configuration: Ticket<{ models: ModelStatus }> | undefined;
  let closing = false;
  let selecting = false;
  let preferences: UserPreferences | undefined;
  let preferencesError: string | null = null;
  try {
    preferences = await UserPreferences.open(path.join(host.workspace, 'preferences.json'));
  } catch (error) {
    preferencesError = errorCode(error);
    host.diagnostics?.record({
      level: 'error',
      source: { process: 'main', module: 'settings' },
      event: 'settings.preferences-unavailable',
      code: preferencesError,
      message: error instanceof Error ? error.message : undefined,
    });
  }

  async function snapshot(): Promise<SettingsSnapshot> {
    let models: ModelStatus | null = null;
    let modelError: string | null = null;
    try {
      models = await host.worker.request('models.status', {}).result;
    } catch (error) {
      modelError = errorCode(error);
      host.diagnostics?.record({
        level: 'warn',
        source: { process: 'main', module: 'settings' },
        event: 'settings.model-status-unavailable',
        code: modelError,
      });
    }
    return {
      preferences: preferences?.snapshot() ?? null,
      preferences_error: preferencesError,
      models,
      model_error: modelError,
      model_override: Boolean(process.env.REUPMATIC_MODEL_MANIFEST),
      runtime: {
        node: process.versions.node,
        electron: process.versions.electron ?? '',
        platform: process.platform,
        app: app.getVersion(),
      },
    };
  }

  host.wire('settings-snapshot', snapshot);
  host.wire('settings-pick-output', async () => {
    if (!preferences) throw new Error(preferencesError ?? 'SETTINGS_UNAVAILABLE');
    const window = host.getWindow();
    if (!window) throw new Error('APP_CLOSING');
    const chosen = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: preferences.snapshot().default_output_dir ?? undefined,
    });
    if (chosen.canceled) return null;
    await preferences.setOutputDirectory(chosen.filePaths[0]);
    return snapshot();
  });
  host.wire('settings-clear-output', async () => {
    if (!preferences) throw new Error(preferencesError ?? 'SETTINGS_UNAVAILABLE');
    await preferences.setOutputDirectory(null);
    return snapshot();
  });
  host.wire('settings-pick-models', async () => {
    if (closing || selecting || configuration) throw new Error('SETTINGS_BUSY');
    if (process.env.REUPMATIC_MODEL_MANIFEST) throw new Error('MODEL_CONFIG_OVERRIDE');
    selecting = true;
    try {
      const window = host.getWindow();
      if (!window) throw new Error('APP_CLOSING');
      const chosen = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [{ name: 'Local model manifest', extensions: ['json'] }],
      });
      if (chosen.canceled) return null;
      const filename = await realpath(chosen.filePaths[0]);
      if (closing) throw new Error('APP_CLOSING');
      configuration = host.worker.request('models.configure', { path: filename });
      await configuration.result;
      const current = host.getWindow();
      if (current && !current.isDestroyed()) current.webContents.send('reupmatic:models-changed');
      return await snapshot();
    } finally {
      configuration = undefined;
      selecting = false;
    }
  });
  host.wire('settings-cancel-models', async () => {
    return configuration ? configuration.cancel() : { requested: false };
  });

  // D-61 / D-10: diagnostics stay a secondary control in collapsed Advanced, and nothing leaves
  // the machine on its own — both of these run only when the user asks, and neither is a network
  // call. There is no in-app viewer; the folder is opened in the OS file manager instead.
  host.wire('diagnostics-open-folder', async () => {
    const sink = host.diagnostics;
    if (!sink) throw new Error('DIAGNOSTICS_UNAVAILABLE');
    const failure = await shell.openPath(sink.directory);
    if (failure) throw new Error('DIAGNOSTICS_UNAVAILABLE');
    return null;
  });
  host.wire('diagnostics-export-bundle', async () => {
    const sink = host.diagnostics;
    if (!sink) throw new Error('DIAGNOSTICS_UNAVAILABLE');
    const window = host.getWindow();
    if (!window) throw new Error('APP_CLOSING');
    const chosen = await dialog.showSaveDialog(window, {
      defaultPath: `reupmatic-support-${new Date().toISOString().slice(0, 10)}.ndjson`,
      filters: [{ name: 'Reupmatic support bundle', extensions: ['ndjson'] }],
    });
    if (chosen.canceled || !chosen.filePath) return null;
    // App version, OS, architecture and runtime availability — nothing that identifies the
    // machine or its user, no paths, and no preference values. A worker that cannot answer is
    // itself the useful fact, so its failure is reported rather than thrown.
    const capabilities = await host.worker.request('hello', {}).result.catch(() => null);
    return sink.exportBundle(chosen.filePath, {
      app: app.getVersion(),
      os: `${process.platform} ${os.release()}`,
      arch: process.arch,
      runtime: {
        node: process.versions.node,
        electron: process.versions.electron ?? '',
        worker: capabilities ? 'available' : 'unavailable',
        ffmpeg: capabilities?.ffmpeg ? 'available' : 'unavailable',
      },
    });
  });

  return {
    get activeCount() {
      return Number(selecting || Boolean(configuration));
    },
    defaultDirectory: () => preferences?.snapshot().default_output_dir ?? undefined,
    savePath: (name: string) => {
      const directory = preferences?.snapshot().default_output_dir;
      return directory ? path.join(directory, name) : name;
    },
    /**
     * D-62: a Douyin download goes to the default download folder, asked for once when unset —
     * the same preference `settings-pick-output` writes, never a second folder setting. Returns
     * `null` when the picker is dismissed, so a cancelled choice starts nothing.
     */
    async ensureDefaultDirectory(): Promise<string | null> {
      if (!preferences) throw new Error(preferencesError ?? 'SETTINGS_UNAVAILABLE');
      const existing = preferences.snapshot().default_output_dir;
      if (existing) return existing;
      const window = host.getWindow();
      if (!window) throw new Error('APP_CLOSING');
      const chosen = await dialog.showOpenDialog(window, {
        properties: ['openDirectory', 'createDirectory'],
        title:
          host.getLanguage?.() === 'vi'
            ? 'Chọn thư mục tải về mặc định'
            : 'Choose a default download folder',
      });
      if (chosen.canceled || chosen.filePaths.length === 0) return null;
      await preferences.setOutputDirectory(chosen.filePaths[0]);
      return chosen.filePaths[0];
    },
    async close() {
      closing = true;
      const active = configuration;
      if (!active) return;
      await active.cancel().catch(() => undefined);
      await active.result.catch(() => undefined);
    },
  };
}
