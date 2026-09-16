import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { useTranslation } from 'react-i18next';
import { useCatalog } from './CatalogProvider';

export function CatalogStatus() {
  const { t } = useTranslation();
  const catalog = useCatalog();
  if (catalog.error)
    return (
      <Banner
        status="error"
        title={t('catalogError')}
        description={
          <>
            <p>
              {t(catalog.error === 'REVISION_CONFLICT' ? 'catalogConflict' : 'catalogErrorHelp')}
            </p>
            <code>{catalog.error}</code>
          </>
        }
        endContent={
          <Button
            label={t('retryLoad')}
            isDisabled={catalog.busy}
            onClick={() => void catalog.reload(true)}
          />
        }
      />
    );
  if (!catalog.snapshot) return <p role="status">{t('catalogLoading')}</p>;
  return null;
}
