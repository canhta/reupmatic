import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DouyinChannel } from '../../../../core/sources/douyin-channel-store';

interface Props {
  channels: DouyinChannel[];
  disabled: boolean;
  onScan(secUid: string): void;
  onAdd(text: string): void;
}

/**
 * The saved Douyin channels, between the Search field and its result table. Each channel is a
 * chip that quick-searches it again, and "Add channel" takes a channel link and searches it (the
 * host then saves the channel). The section always renders so the add action is always available.
 */
export function SavedChannels({ channels, disabled, onScan, onAdd }: Props) {
  const { t, i18n } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState('');

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
    <section className="downloads-channels" aria-label={t('douyinChannelsTitle')}>
      <Text type="supporting">{t('douyinChannelsTitle')}</Text>
      <div className="downloads-channel-chips">
        {channels.map((channel) => (
          <Button
            key={channel.secUid}
            size="sm"
            variant="secondary"
            label={channel.nickname ?? channel.secUid}
            tooltip={t('douyinChannelLastScanned', {
              time: new Intl.DateTimeFormat(i18n.language, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(channel.lastScannedAt),
            })}
            isDisabled={disabled}
            onClick={() => onScan(channel.secUid)}
          />
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={<Icon icon={Plus} size="sm" />}
          label={t('douyinChannelAdd')}
          isDisabled={disabled}
          onClick={() => setDialogOpen(true)}
        />
      </div>
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
    </section>
  );
}
