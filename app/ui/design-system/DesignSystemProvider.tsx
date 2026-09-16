import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmationProvider } from './ConfirmationProvider';
import { componentMessages } from './component-messages';

export function DesignSystemProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  return (
    <InternationalizationProvider locale={i18n.language} overrides={componentMessages}>
      <Theme theme={neutralTheme} mode="dark">
        <ConfirmationProvider>{children}</ConfirmationProvider>
      </Theme>
    </InternationalizationProvider>
  );
}
