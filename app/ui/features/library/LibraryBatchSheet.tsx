import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  count: number;
  busy: boolean;
  onClose(): void;
  onConfirm(): void;
}

export function LibraryBatchSheet({ open, count, busy, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      purpose="form"
      width={420}
    >
      <Layout
        header={
          <DialogHeader
            title={t('libraryBatchTitle', { count })}
            onOpenChange={(next) => {
              if (!next) onClose();
            }}
          />
        }
        content={
          <LayoutContent>
            <Text as="p" type="body">
              {t('libraryBatchHint')}
            </Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button label={t('cancel')} onClick={onClose} />
              <Button
                label={t('libraryBatchConfirm')}
                variant="primary"
                isDisabled={busy}
                onClick={onConfirm}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
