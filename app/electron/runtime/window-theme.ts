import { type BrowserWindow, nativeTheme } from 'electron';
import { resolveWindowChrome } from './window-chrome.js';

/** Keeps Windows/Linux overlay colours in step with the OS theme; no-op on macOS. */
export function watchTitleBarOverlay(win: BrowserWindow, platform: string): () => void {
  if (resolveWindowChrome(platform).titleBarStyle !== 'hidden') return () => {};
  const apply = () => {
    const chrome = resolveWindowChrome(platform, nativeTheme.shouldUseDarkColors);
    if (chrome.titleBarStyle === 'hidden') win.setTitleBarOverlay(chrome.titleBarOverlay);
  };
  apply();
  nativeTheme.on('updated', apply);
  return () => nativeTheme.off('updated', apply);
}
