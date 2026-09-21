export interface TrafficLightPosition {
  readonly x: number;
  readonly y: number;
}

export interface TitleBarOverlayOptions {
  readonly color: string;
  readonly symbolColor: string;
  readonly height: number;
}

export type WindowChromeOptions =
  | { readonly titleBarStyle: 'hiddenInset'; readonly trafficLightPosition: TrafficLightPosition }
  | { readonly titleBarStyle: 'hidden'; readonly titleBarOverlay: TitleBarOverlayOptions };

// This main-process module cannot read CSS custom properties at runtime, so these are hand-
// copied from the Astryx theme tokens the shell's own toolbar band uses (--bg-nav/--text-strong)
// — light and dark, from @astryxdesign/theme-neutral's --color-background-muted/
// --color-text-primary: light-dark(#f1f1f1,#1b1b1b) / light-dark(#000000,#ffffff)
// (node_modules/@astryxdesign/theme-neutral/dist/theme.css). Re-check them if either token or
// the theme package changes. The single source every window's chrome reads from.
export const WINDOW_CHROME_COLORS = {
  light: { background: '#f1f1f1', symbol: '#000000' },
  dark: { background: '#1b1b1b', symbol: '#ffffff' },
} as const;

// Matches --shell-toolbar-h (app/ui/design-tokens.css) so the OS-drawn caption buttons line up
// with the app's own toolbar band instead of a second, mismatched strip.
export const WINDOW_CHROME_TOOLBAR_HEIGHT = 48;

/**
 * Per-OS `BrowserWindow` chrome options for a custom-chrome window. Plain data only (no Electron
 * import) so this is unit-testable without a running Electron instance — see
 * tests/native/window-chrome-native.test.mjs.
 *
 * macOS keeps the existing hiddenInset traffic-light treatment (unaffected by `isDark`: macOS
 * draws its own traffic lights, not a colour this module controls). Windows/Linux get Electron's
 * Window Controls Overlay (`titleBarOverlay`) instead: without it Electron draws no WCO at all,
 * so the custom chrome silently does not exist on Windows. `isDark` (typically
 * `nativeTheme.shouldUseDarkColors`) picks the overlay's light/dark colours; callers that also
 * want it to track a live OS theme change use `watchTitleBarOverlay` in `window-theme.ts`.
 */
export function resolveWindowChrome(platform: string, isDark = true): WindowChromeOptions {
  if (platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 17 } };
  }
  const colors = isDark ? WINDOW_CHROME_COLORS.dark : WINDOW_CHROME_COLORS.light;
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: colors.background,
      symbolColor: colors.symbol,
      height: WINDOW_CHROME_TOOLBAR_HEIGHT,
    },
  };
}
