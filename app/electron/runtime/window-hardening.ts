import type { BrowserWindow } from 'electron';

/**
 * Denies `window.open()` and blocks navigating the window away from the app's own page, except
 * to the dev server's own origin (hot reload navigates within it). Every `BrowserWindow` this
 * app creates that carries our preload (main.ts's one main window today — D-57 removed the
 * independent Settings window) applies the same policy through this one function rather than a
 * hand-copied pair of listeners each.
 */
export function hardenWindow(win: BrowserWindow, devServerUrl?: string): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const devServerOrigin = devServerUrl ? new URL(devServerUrl).origin : undefined;
  win.webContents.on('will-navigate', (event, url) => {
    if (devServerOrigin && new URL(url).origin === devServerOrigin) return;
    event.preventDefault();
  });
}
