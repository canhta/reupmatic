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

// Hand-copied from the theme tokens; re-check if the theme package changes.
export const WINDOW_CHROME_COLORS = {
  light: { background: '#f1f1f1', symbol: '#000000' },
  dark: { background: '#1b1b1b', symbol: '#ffffff' },
} as const;

// Matches --shell-toolbar-h so caption buttons line up with the app toolbar.
export const WINDOW_CHROME_TOOLBAR_HEIGHT = 48;

/** Per-OS chrome; Windows/Linux need titleBarOverlay or no WCO is drawn. */
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
