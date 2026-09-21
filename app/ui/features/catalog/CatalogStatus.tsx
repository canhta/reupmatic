import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
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
            <Text as="p" type="body">
              {t(catalog.error === 'REVISION_CONFLICT' ? 'catalogConflict' : 'catalogErrorHelp')}
            </Text>
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
  if (!catalog.snapshot)
    return (
      <Text as="p" type="body" role="status">
        {t('catalogLoading')}
      </Text>
    );
  return null;
}
