import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { LayerProvider } from '@astryxdesign/core/Layer';
import { Theme } from '@astryxdesign/core/theme';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmationProvider } from './ConfirmationProvider';
import { componentMessages } from './component-messages';
import { reupmaticNeutralTheme } from './theme/reupmatic-neutral';
import './theme/reupmatic-neutral.css';

export function DesignSystemProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  return (
    <InternationalizationProvider locale={i18n.language} overrides={componentMessages}>
      <Theme theme={reupmaticNeutralTheme} mode="dark">
        <LayerProvider>
          <ConfirmationProvider>{children}</ConfirmationProvider>
        </LayerProvider>
      </Theme>
    </InternationalizationProvider>
  );
}
