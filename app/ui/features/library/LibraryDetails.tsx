import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Heading } from '@astryxdesign/core/Heading';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { useTranslation } from 'react-i18next';
import { type ContentEntry, contentDurationMs } from '../../../core/library/library-contracts';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';

interface Props {
  item: ContentEntry;
  busy: boolean;
  onAction(work: () => Promise<void>): Promise<void>;
  onOpen(id: string, projectId?: string): Promise<void>;
}

export function LibraryDetails({ item, busy, onAction, onOpen }: Props) {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const current = item;
  const needsAttention = item.availability === 'missing' || item.availability === 'changed';
  const duration = contentDurationMs(item);
  const openable = item.media_kind === 'video';

  async function forget() {
    const accepted = await confirm(t('libraryForgetConfirm', { name: current.name }), {
      title: t('confirmRemoveTitle'),
      confirmLabel: t('confirmRemoveAction'),
      destructive: true,
    });
    if (accepted) await unwrap(window.reupmatic.libraryForget(current.id));
  }

  return (
    <Section variant="transparent" padding={0} aria-label={t('libraryDetails')}>
      <div className="action-row">
        {}
        {openable && (
          <Button
            label={t('libraryOpen')}
            tooltip={t('libraryOpen')}
            variant="primary"
            isDisabled={busy}
            onClick={() => void onAction(() => onOpen(current.id))}
          />
        )}
      </div>
      {}
      <div className="library-detail-facts">
        <MetadataList label={{ position: 'start' }}>
          <MetadataListItem label={t('libraryDuration')}>
            {}
            {duration === null ? (
              '—'
            ) : (
              <>
                <Text type="body" className="numeric" hasTabularNumbers>
                  {(duration / 1000).toFixed(2)} s
                </Text>
                {item.video && (
                  <>
                    {' · '}
                    {item.video.width}×{item.video.height}
                  </>
                )}
              </>
            )}
          </MetadataListItem>
          <MetadataListItem label={t('libraryImported')}>
            <Timestamp value={new Date(item.added_at).toISOString()} format="date" />
          </MetadataListItem>
          <MetadataListItem label={t('libraryStorage')}>
            {t(item.storage === 'copy' ? 'libraryCopy' : 'libraryReference')}
          </MetadataListItem>
          {}
          <MetadataListItem label={t('libraryOrigin')}>
            {t(`libraryFilterOrigin_${item.origin.kind}`)}
          </MetadataListItem>
          {item.origin.kind === 'douyin' && item.origin.share_url && (
            <MetadataListItem label={t('libraryShareUrl')}>
              <Text type="body" className="library-path" maxLines={1}>
                {item.origin.share_url}
              </Text>
            </MetadataListItem>
          )}
          <MetadataListItem label={t('libraryStatus')}>
            <div className="library-detail-state">
              {needsAttention ? (
                <Badge
                  variant={item.availability === 'missing' ? 'error' : 'warning'}
                  label={t(`libraryAvailability_${item.availability}`)}
                />
              ) : (
                t(`libraryAvailability_${item.availability}`)
              )}
              {needsAttention && (
                <Button
                  label={t('libraryRelink')}
                  tooltip={t('libraryRelink')}
                  isDisabled={busy}
                  onClick={() =>
                    void onAction(async () => {
                      await unwrap(window.reupmatic.libraryRelink(current.id));
                    })
                  }
                />
              )}
            </div>
          </MetadataListItem>
          <MetadataListItem label={t('librarySourcePath')}>
            <Text type="body" className="library-path" maxLines={1}>
              {item.path}
            </Text>
          </MetadataListItem>
        </MetadataList>
      </div>
      {item.links.length > 0 ? (
        <>
          <Heading level={5}>{t('libraryRelated')}</Heading>
          <Text as="p" type="body">
            {t('libraryPage', {
              from: 1,
              to: item.links.length,
              total: item.links.length,
            })}
          </Text>
        </>
      ) : (
        <Text as="p" type="supporting">
          {t('libraryNoLinks')}
        </Text>
      )}
      <Collapsible trigger={t('libraryMoreActions')} defaultIsOpen={false}>
        <div className="library-detail-more">
          <Button
            label={t('libraryReveal')}
            tooltip={t('libraryReveal')}
            isDisabled={busy}
            onClick={() =>
              void onAction(async () => {
                await unwrap(window.reupmatic.libraryReveal(current.id));
              })
            }
          />
          <Collapsible trigger={t('libraryHash')} defaultIsOpen={false}>
            <code>{item.sha256}</code>
          </Collapsible>
          <Button
            label={t('libraryForget')}
            tooltip={t('libraryForget')}
            variant="destructive"
            isDisabled={busy}
            onClick={() => void onAction(forget)}
          />
        </div>
      </Collapsible>
    </Section>
  );
}
