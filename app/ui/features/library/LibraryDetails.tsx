import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Section } from '@astryxdesign/core/Section';
import { useTranslation } from 'react-i18next';
import type { LibraryItem } from '../../../core/library/library-types';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';

interface Props {
  item: LibraryItem | null;
  busy: boolean;
  onAction(work: () => Promise<void>): Promise<void>;
  onOpen(id: string, projectId?: string): Promise<void>;
  onAssets(item: LibraryItem): void;
}

export function LibraryDetails({ item, busy, onAction, onOpen, onAssets }: Props) {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  if (!item) return <EmptyState isCompact title={t('libraryDetailsEmpty')} />;
  const current = item;

  async function forget() {
    const dependencies = await unwrap(window.reupmatic.libraryDependencies(current.id));
    const accepted = await confirm(
      t('libraryForgetConfirm', {
        name: current.name,
        links: dependencies.item.links.length,
        jobs: dependencies.pending_jobs,
        posts: dependencies.posts ?? 0,
        pendingPosts: dependencies.pending_posts ?? 0,
        workflows: dependencies.workflows ?? 0,
      }),
    );
    if (accepted) await unwrap(window.reupmatic.libraryForget(current.id));
  }

  return (
    <Section
      variant="transparent"
      padding={0}
      className="library-details"
      aria-label={t('libraryDetails')}
    >
      <h2>{item.name}</h2>
      <div className="action-row">
        <Button
          label={t('libraryOpen')}
          variant="primary"
          isDisabled={busy}
          onClick={() => void onAction(() => onOpen(current.id))}
        />
        <Button
          label={t('libraryReveal')}
          isDisabled={busy}
          onClick={() =>
            void onAction(async () => {
              await unwrap(window.reupmatic.libraryReveal(current.id));
            })
          }
        />
      </div>
      <MetadataList label={{ position: 'top' }}>
        <MetadataListItem label={t('librarySourcePath')}>
          <span className="library-path">{item.path}</span>
        </MetadataListItem>
        <MetadataListItem label={t('libraryStorage')}>
          {t(item.storage === 'copy' ? 'libraryCopy' : 'libraryReference')}
        </MetadataListItem>
        <MetadataListItem label={t('libraryStatus')}>
          {t(`libraryAvailability_${item.availability}`)}
        </MetadataListItem>
      </MetadataList>
      <Button
        label={t('libraryRelink')}
        isDisabled={busy}
        onClick={() =>
          void onAction(async () => {
            await unwrap(window.reupmatic.libraryRelink(current.id));
          })
        }
      />
      <Collapsible trigger={t('libraryHash')} defaultIsOpen={false}>
        <code>{item.sha256}</code>
      </Collapsible>
      <h3>{t('libraryRelated')}</h3>
      <p className="field-help">{t('libraryKnownLinks')}</p>
      <p>
        {t('libraryPage', {
          from: item.links.length ? 1 : 0,
          to: item.links.length,
          total: item.links.length,
        })}
      </p>
      <Button label={t('assetRelated')} isDisabled={busy} onClick={() => onAssets(current)} />
      <Button
        label={t('libraryForget')}
        variant="destructive"
        isDisabled={busy}
        onClick={() => void onAction(forget)}
      />
    </Section>
  );
}
