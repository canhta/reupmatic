import { type BrowserWindow, nativeTheme } from 'electron';
import { resolveWindowChrome } from './window-chrome.js';

/**
 * Keeps a Windows/Linux window's Window Controls Overlay colours in step with the OS light/dark
 * setting after creation — `titleBarOverlay` is otherwise fixed to whatever `resolveWindowChrome`
 * returned at construction time. No-op on macOS (`hiddenInset`, no `titleBarOverlay` to update).
 * Returns a disposer; call it when the window closes.
 */
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
