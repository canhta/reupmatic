import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { app, type BrowserWindow, dialog } from 'electron';
import type { PreferencesStore } from '../../../core/settings/preferences-store.js';
import type { SettingsSnapshot } from '../../../core/settings/settings-types.js';
import type { ModelStatus } from '../../../core/vision/vision.js';
import type { Ticket, WorkerClient } from '../../../core/worker/worker-client.js';
import { errorCode, type IpcWire } from '../../runtime/ipc.js';

interface Host {
  wire: IpcWire;
  getWindow(): BrowserWindow;
  worker: WorkerClient;
  preferences: PreferencesStore | undefined;
  preferencesError: string | null;
}

export function installSettings(host: Host) {
  let configuration: Ticket<{ models: ModelStatus }> | undefined;
  let closing = false;
  let selecting = false;

  async function snapshot(): Promise<SettingsSnapshot> {
    let models: ModelStatus | null = null;
    let modelError: string | null = null;
    try {
      models = await host.worker.request<ModelStatus>('models.status', {}).result;
    } catch (error) {
      modelError = errorCode(error);
    }
    return {
      preferences: host.preferences?.snapshot() ?? null,
      preferences_error: host.preferencesError,
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
    if (!host.preferences) throw new Error(host.preferencesError ?? 'SETTINGS_UNAVAILABLE');
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: host.preferences.snapshot().default_output_dir ?? undefined,
    });
    if (chosen.canceled) return null;
    await host.preferences.setOutputDirectory(chosen.filePaths[0]);
    return snapshot();
  });
  host.wire('settings-clear-output', async () => {
    if (!host.preferences) throw new Error(host.preferencesError ?? 'SETTINGS_UNAVAILABLE');
    await host.preferences.setOutputDirectory(null);
    return snapshot();
  });
  host.wire('settings-pick-models', async () => {
    if (closing || selecting || configuration) throw new Error('SETTINGS_BUSY');
    if (process.env.REUPMATIC_MODEL_MANIFEST) throw new Error('MODEL_CONFIG_OVERRIDE');
    selecting = true;
    try {
      const chosen = await dialog.showOpenDialog(host.getWindow(), {
        properties: ['openFile'],
        filters: [{ name: 'Local model manifest', extensions: ['json'] }],
      });
      if (chosen.canceled) return null;
      const filename = await realpath(chosen.filePaths[0]);
      if (closing) throw new Error('APP_CLOSING');
      configuration = host.worker.request('models.configure', { path: filename });
      await configuration.result;
      const window = host.getWindow();
      if (!window.isDestroyed()) window.webContents.send('reupmatic:models-changed');
      return await snapshot();
    } finally {
      configuration = undefined;
      selecting = false;
    }
  });
  host.wire('settings-cancel-models', async () => {
    return configuration ? configuration.cancel() : { requested: false };
  });

  return {
    get active() {
      return selecting || Boolean(configuration);
    },
    defaultDirectory: () => host.preferences?.snapshot().default_output_dir ?? undefined,
    savePath: (name: string) => {
      const directory = host.preferences?.snapshot().default_output_dir;
      return directory ? path.join(directory, name) : name;
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
