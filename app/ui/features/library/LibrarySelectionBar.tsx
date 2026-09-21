import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';

interface Props {
  count: number;
  disabled: boolean;
  onPrepare(): void;
  onClear(): void;
}

export function LibrarySelectionBar({ count, disabled, onPrepare, onClear }: Props) {
  const { t } = useTranslation();
  if (!count) return null;
  return (
    <div className="library-selection-bar" role="status">
      <Text type="body">{t('librarySelection', { count })}</Text>
      <div className="action-row">
        <Button
          label={t('libraryProcess')}
          variant="primary"
          isDisabled={disabled}
          onClick={onPrepare}
        />
        <Button label={t('libraryClearSelection')} isDisabled={disabled} onClick={onClear} />
      </div>
    </div>
  );
}
