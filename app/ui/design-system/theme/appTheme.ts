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
    // A count badge pinned to the corner of the button that renders it.
    badge: {
      'variant:notificationCount': {
        position: 'absolute',
        insetBlockStart: 'calc(-1 * var(--spacing-1))',
        insetInlineEnd: 'calc(-1 * var(--spacing-1))',
        pointerEvents: 'none',
        backgroundColor: 'var(--color-accent)',
        color: 'var(--color-on-accent)',
      },
    },
  },
});
