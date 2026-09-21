import { autoUpdater } from 'electron-updater';
import { shouldCheckForUpdates } from '../../core/runtime/auto-update-gate.js';
import type { DiagnosticSink } from './diagnostic-sink.js';

export interface AutoUpdateHost {
  packaged: boolean;
  devServerUrl?: string | undefined;
  /** Push the downloaded version to the renderer so it can raise one notification (D-64). */
  onUpdateDownloaded: (version: string) => void;
  diagnostics?: DiagnosticSink | undefined;
}

export interface AutoUpdate {
  check(): void;
  install(): void;
}

/**
 * Auto-update from the GitHub release feed (electron-builder's `publish` config writes the
 * `app-update.yml` electron-updater reads). Only a packaged app updates itself; a dev run never
 * does. An update downloads in the background and installs on the next quit, and the renderer is
 * told once it is ready so the user can choose to restart now. A failure is recorded, never
 * surfaced as a modal that interrupts work.
 */
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
        // The 'error' handler above records it; a check failure must never break startup.
      });
    },
    install() {
      if (!allowed()) return;
      autoUpdater.quitAndInstall();
    },
  };
}
