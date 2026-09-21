import { createRequire } from 'node:module';
import { shouldCheckForUpdates } from '../../core/runtime/auto-update-gate.js';
import type { DiagnosticSink } from './diagnostic-sink.js';

// electron-updater is CJS whose `autoUpdater` is a defineProperty getter; Node's ESM
// interop cannot synthesise the named export, so require it explicitly.
const { autoUpdater } = createRequire(import.meta.url)(
  'electron-updater',
) as typeof import('electron-updater');

export interface AutoUpdateHost {
  packaged: boolean;
  devServerUrl?: string | undefined;
  onUpdateDownloaded: (version: string) => void;
  diagnostics?: DiagnosticSink | undefined;
}

export interface AutoUpdate {
  check(): void;
  install(): void;
}

/** Auto-update from the GitHub feed; packaged only, and failures are recorded, never modal. */
export function installAutoUpdate(host: AutoUpdateHost): AutoUpdate {
  const allowed = () =>
    shouldCheckForUpdates({ packaged: host.packaged, devServerUrl: host.devServerUrl });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (error) => {
    host.diagnostics?.record({
      level: 'warn',
      source: { process: 'main', module: 'auto-update' },
      event: 'update.failed',
      message: error instanceof Error ? error.message : String(error),
    });
  });
  autoUpdater.on('update-downloaded', (info) => host.onUpdateDownloaded(info.version));

  return {
    check() {
      if (!allowed()) return;
      host.diagnostics?.record({
        level: 'info',
        source: { process: 'main', module: 'auto-update' },
        event: 'update.checking',
      });
      void autoUpdater.checkForUpdates().catch(() => {
        // Recorded by the 'error' handler above; never break startup.
      });
    },
    install() {
      if (!allowed()) return;
      autoUpdater.quitAndInstall();
    },
  };
}
