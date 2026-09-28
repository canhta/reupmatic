import type { BrowserWindow } from 'electron';

/** Denies window.open and blocks navigation away from the app origin (dev server allowed). */
export function hardenWindow(win: BrowserWindow, devServerUrl?: string): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : undefined;
  win.webContents.on('will-navigate', (event, url) => {
    if (devServerOrigin && new URL(url).origin === devServerOrigin) return;
    event.preventDefault();
  });
}
