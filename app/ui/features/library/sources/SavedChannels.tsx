import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DouyinChannel } from '../../../../core/sources/douyin-channel-store';
import { PanelSection } from '../../../design-system/Panel';

interface Props {
  channels: DouyinChannel[];
  disabled: boolean;
  onScan(secUid: string): void;
  onAdd(text: string): void;
}

export function SavedChannels({ channels, disabled, onScan, onAdd }: Props) {
  const { t, i18n } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  function close() {
    setDialogOpen(false);
    setDraft('');
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    close();
    onAdd(text);
  }

  return (
    <PanelSection
      title={t('douyinChannelsTitle')}
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<Icon icon={Plus} size="sm" />}
          label={t('douyinChannelAdd')}
          isDisabled={disabled}
          onClick={() => setDialogOpen(true)}
        />
      }
    >
      {channels.length > 0 && (
        <List density="compact" hasDividers>
          {channels.map((channel) => (
            <ListItem
              key={channel.secUid}
              label={channel.nickname ?? channel.secUid}
              description={t('douyinChannelLastScanned', {
                time: time.format(channel.lastScannedAt),
              })}
              isDisabled={disabled}
              endContent={
                <Button
                  size="sm"
                  label={t('douyinSearchSubmit')}
                  isDisabled={disabled}
                  onClick={() => onScan(channel.secUid)}
                />
              }
            />
          ))}
        </List>
      )}
      <Dialog
        isOpen={dialogOpen}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        purpose="form"
        width={480}
      >
        <Layout
          header={
            <DialogHeader
              title={t('douyinChannelAddTitle')}
              onOpenChange={(next) => {
                if (!next) close();
              }}
            />
          }
          content={
            <LayoutContent>
              <TextInput
                label={t('douyinChannelAddField')}
                isLabelHidden
                placeholder={t('douyinChannelAddField')}
                value={draft}
                hasAutoFocus
                onChange={setDraft}
                onEnter={submit}
              />
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={t('cancel')} onClick={close} />
                <Button
                  variant="primary"
                  label={t('douyinChannelAdd')}
                  isDisabled={draft.trim().length === 0}
                  onClick={submit}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </PanelSection>
  );
}
