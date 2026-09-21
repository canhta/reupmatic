import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';

// CSP allows font-src 'self' data:, so the Figtree webfont never loads; pin the OS UI stack.
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
