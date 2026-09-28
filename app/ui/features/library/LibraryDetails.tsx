import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { useTranslation } from 'react-i18next';
import { type ContentEntry, contentDurationMs } from '../../../core/library/library-contracts';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { CommandFooter, PanelRows, PanelSection, ValueRow } from '../../design-system/Panel';
import { ContentLabels } from '../taxonomy/ContentLabels';

interface Props {
  item: ContentEntry;
  busy: boolean;
  onAction(work: () => Promise<void>): Promise<void>;
  onOpen(id: string, projectId?: string): Promise<void>;
}

export function LibraryDetails({ item, disabled }: { item: ContentEntry; disabled: boolean }) {
  const { t } = useTranslation();
  const duration = contentDurationMs(item);
  return (
    <PanelSection title={t('libraryDetailsTitle')}>
      <PanelRows>
        <ValueRow label={t('libraryDuration')}>
          {duration === null ? (
            '—'
          ) : (
            <Text type="body" hasTabularNumbers>
              {(duration / 1000).toFixed(2)} s
              {item.video && ` · ${item.video.width}×${item.video.height}`}
            </Text>
          )}
        </ValueRow>
        <ValueRow label={t('libraryImported')}>
          <Timestamp value={new Date(item.added_at).toISOString()} format="date" />
        </ValueRow>
        <ValueRow label={t('libraryStorage')}>
          {t(item.storage === 'copy' ? 'libraryCopy' : 'libraryReference')}
        </ValueRow>
        <ValueRow label={t('libraryOrigin')}>
          {t(`libraryFilterOrigin_${item.origin.kind}`)}
        </ValueRow>
        {item.origin.kind === 'douyin' && item.origin.share_url && (
          <ValueRow label={t('libraryShareUrl')}>{item.origin.share_url}</ValueRow>
        )}
        <ValueRow label={t('libraryStatus')}>
          {t(`libraryAvailability_${item.availability}`)}
        </ValueRow>
        <ValueRow label={t('librarySourcePath')}>{item.path}</ValueRow>
        <ContentLabels item={item} disabled={disabled} />
      </PanelRows>
    </PanelSection>
  );
}

export function LibraryDetailsFooter({ item, busy, onAction, onOpen }: Props) {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const needsAttention = item.availability === 'missing' || item.availability === 'changed';

  async function forget() {
    const accepted = await confirm(t('libraryForgetConfirm', { name: item.name }), {
      title: t('confirmRemoveTitle'),
      confirmLabel: t('confirmRemoveAction'),
      destructive: true,
    });
    if (accepted) await unwrap(window.reupmatic.libraryForget(item.id));
  }

  const open = () => void onAction(() => onOpen(item.id));
  const isVideo = item.media_kind === 'video';

  return (
    <CommandFooter
      status={
        needsAttention
          ? { tone: 'warning', text: t(`libraryAvailability_${item.availability}`) }
          : null
      }
      menuLabel={t('libraryMoreActions')}
      menu={[
        ...(needsAttention && isVideo
          ? [{ label: t('libraryOpen'), isDisabled: busy, onClick: open }]
          : []),
        {
          label: t('libraryReveal'),
          isDisabled: busy,
          onClick: () =>
            void onAction(async () => {
              await unwrap(window.reupmatic.libraryReveal(item.id));
            }),
        },
        { type: 'divider' },
        {
          label: t('libraryForget'),
          variant: 'destructive',
          isDisabled: busy,
          onClick: () => void onAction(forget),
        },
      ]}
    >
      {needsAttention ? (
        <Button
          label={t('libraryRelink')}
          variant="primary"
          isDisabled={busy}
          onClick={() =>
            void onAction(async () => {
              await unwrap(window.reupmatic.libraryRelink(item.id));
            })
          }
        />
      ) : (
        isVideo && (
          <Button label={t('libraryOpen')} variant="primary" isDisabled={busy} onClick={open} />
        )
      )}
    </CommandFooter>
  );
}
