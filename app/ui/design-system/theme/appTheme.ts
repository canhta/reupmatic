import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

// Themed variant of neutralTheme: flattens the default squircle "widget" radius to a native,
// lower-radius list highlight, via SideNavItem's own `defineTheme` "Theming" section (UI-CC03)
// rather than an `.astryx-side-nav-item` override.
//
// typography: neutralTheme names the "Figtree" webfont, which this app never loads (and cannot
// from Google Fonts under the app:// CSP, `font-src 'self' data:`), so every machine already
// renders the system fallback. Pin the OS UI stack explicitly instead (UI-T08) — the theme then
// declares no unloaded webfont, and `astryx theme build` stays warning-free.
//
// Built by `npm run theme:build` into the neighboring `reupmatic-neutral.{js,css,d.ts}` (derived
// artifacts, not committed); DesignSystemProvider imports those so the theme is pre-compiled
// instead of injected at runtime.
const systemUiStack =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const reupmaticNeutralTheme = defineTheme({
  name: 'reupmatic-neutral',
  extends: neutralTheme,
  tokens: {
    '--font-family-body': systemUiStack,
    '--font-family-heading': systemUiStack,
  },
  components: {
    'side-nav-item': {
      base: { borderRadius: 'var(--radius-sm)' },
    },
  },
});
