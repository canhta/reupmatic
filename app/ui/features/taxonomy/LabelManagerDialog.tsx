import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { useTranslation } from 'react-i18next';
import { LabelManager } from './LabelManager';

export function LabelManagerDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useTranslation();
  const dismiss = (next: boolean) => {
    if (!next) onClose();
  };
  return (
    <Dialog isOpen={open} onOpenChange={dismiss} purpose="form" width={960} maxHeight="80dvh">
      <Layout
        header={<DialogHeader title={t('catalogLabels')} onOpenChange={dismiss} />}
        content={
          <LayoutContent>
            <LabelManager />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
