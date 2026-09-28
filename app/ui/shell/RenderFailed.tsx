import { Banner } from '@astryxdesign/core/Banner';
import { useTranslation } from 'react-i18next';

export function RenderFailed() {
  const { t } = useTranslation();
  return (
    <Banner status="error" title={t('renderFailedTitle')} description={t('renderFailedDetail')} />
  );
}
