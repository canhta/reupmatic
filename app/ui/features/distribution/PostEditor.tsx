import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack } from '@astryxdesign/core/HStack';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExportChoice, Post } from '../../../core/distribution/distribution-contracts';
import { readPlanDraft } from '../../../core/distribution/post-schedule';
import { unwrap } from '../../bridge/client';
import { useCatalog } from '../catalog/CatalogProvider';
import type { useRecordDraft } from '../catalog/useRecordDraft';
import { PostPlanFields } from './PostPlanFields';
import { PostPublication } from './PostPublication';
import { type PostDraft, postDraft } from './post-draft';

export function PostEditor({
  form,
  onSaved,
}: {
  form: ReturnType<typeof useRecordDraft<PostDraft>>;
  onSaved(post: Post): void;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const { value: draft, setValue: setDraft } = form;
  const [exports, setExports] = useState<ExportChoice[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [_generation, setGeneration] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoadError(false);
    void unwrap(window.reupmatic.postExportChoices())
      .then((value) => {
        if (alive) setExports(value);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    const unsubscribe = window.reupmatic.onLibraryChanged(() =>
      setGeneration((value) => value + 1),
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  const disabled = catalog.busy || !catalog.snapshot;
  const selectedExport = exports.find((item) => item.export_id === draft.export_id);
  const channels = catalog.snapshot?.channels.filter((channel) => !channel.archived) ?? [];
  const links = catalog.snapshot?.links.filter((link) => !link.archived) ?? [];
  const selectedChannel =
    channels.find((channel) => channel.id === draft.channel_id) ?? draft.saved?.channel;
  const isYouTube = selectedChannel?.platform === 'youtube';
  const youtubeOptions = draft.options.youtube;
  const validOptions = !isYouTube || youtubeOptions !== null;
  let validPlan = true;
  try {
    readPlanDraft(draft.plan);
  } catch {
    validPlan = false;
  }

  function setYouTube(patch: Partial<NonNullable<typeof youtubeOptions>>) {
    setDraft({
      ...draft,
      options: {
        youtube: {
          self_declared_made_for_kids: youtubeOptions?.self_declared_made_for_kids ?? false,
          contains_synthetic_media: youtubeOptions?.contains_synthetic_media ?? false,
          ...patch,
        },
      },
    });
  }

  async function save() {
    if (!validPlan || !validOptions || (!draft.saved && !selectedExport)) return;
    const planned = readPlanDraft(draft.plan);
    const identity = {
      id: draft.id,
      expected_revision: draft.expected_revision,
      title: draft.title,
      body: draft.body,
      planned,
      options: draft.options,
    };
    const result = await catalog.mutate(() => {
      if (draft.saved) return window.reupmatic.postEdit({ ...identity, state: draft.state });
      if (!selectedExport) throw new Error('INVALID_STATE');
      return window.reupmatic.postCreate({
        ...identity,
        channel_id: draft.channel_id,
        library_id: selectedExport.library_id,
        export_id: selectedExport.export_id,
        link_ids: draft.link_ids,
      });
    });
    if (result) {
      form.replace(postDraft(result));
      onSaved(result);
    }
  }

  return (
    <VStack gap={3}>
      {!draft.saved ? (
        <>
          <FormLayout>
            <Selector
              label={t('postDestination')}
              value={draft.channel_id}
              isDisabled={disabled}
              placeholder={t('postChooseChannel')}
              options={channels.map((channel) => ({ value: channel.id, label: channel.name }))}
              onChange={(channel_id) =>
                setDraft({ ...draft, channel_id, options: { youtube: null } })
              }
            />
            <Selector
              label={t('postExport')}
              value={draft.export_id}
              isDisabled={disabled || loadError}
              placeholder={t('postChooseExport')}
              options={exports.map((item) => ({
                value: item.export_id,
                label: `${item.content_name} — ${item.name}`,
              }))}
              onChange={(export_id) => setDraft({ ...draft, export_id })}
            />
          </FormLayout>
          {loadError && (
            <Banner
              status="error"
              title={t('postExportsError')}
              endContent={
                <Button
                  label={t('retryLoad')}
                  onClick={() => setGeneration((value) => value + 1)}
                />
              }
            />
          )}
          {!exports.length && !loadError && (
            <Text as="p" type="body">
              {t('postExportsEmpty')}
            </Text>
          )}
          <MultiSelector
            label={t('postLinks')}
            value={draft.link_ids}
            isDisabled={disabled}
            placeholder={t('postLinksOptional')}
            hasSearch
            triggerDisplay="labels"
            options={links.map((link) => ({ value: link.id, label: `${link.name} — ${link.url}` }))}
            emptyText={t('affiliateEmpty')}
            emptySearchText={t('catalogNoMatches')}
            searchPlaceholder={t('catalogSearch')}
            onChange={(link_ids) => setDraft({ ...draft, link_ids })}
          />
        </>
      ) : (
        <>
          <MetadataList>
            <MetadataListItem label={t('postDestination')}>
              {draft.saved.channel.name}
            </MetadataListItem>
            <MetadataListItem label={t('postExport')}>{draft.saved.export.name}</MetadataListItem>
            <MetadataListItem label={t('postLinks')}>
              {draft.saved.links.length
                ? draft.saved.links.map((link) => (
                    <Text as="p" type="body" key={link.id}>
                      {link.name} — {link.url}
                    </Text>
                  ))
                : t('postNoLinks')}
            </MetadataListItem>
          </MetadataList>
          <Text as="p" type="supporting">
            {t('postSnapshotHelp')}
          </Text>
          <Button
            label={t('batchShowOutput')}
            isDisabled={disabled}
            onClick={() => void catalog.mutate(() => window.reupmatic.postReveal(draft.id))}
          />
          <PostPublication
            post={draft.saved}
            disabled={disabled}
            onUpdated={(updated) => form.replace(postDraft(updated))}
          />
        </>
      )}
      <TextInput
        label={t('postTitle')}
        value={draft.title}
        isDisabled={disabled}
        onChange={(title) => setDraft({ ...draft, title })}
      />
      <TextArea
        label={t('postBody')}
        value={draft.body}
        isDisabled={disabled}
        onChange={(body) => setDraft({ ...draft, body })}
      />
      <PostPlanFields
        value={draft.plan}
        onChange={(plan) => setDraft({ ...draft, plan })}
        disabled={disabled}
      />
      {isYouTube && (
        <VStack gap={2}>
          <Selector
            label={t('postMadeForKids')}
            value={
              youtubeOptions ? (youtubeOptions.self_declared_made_for_kids ? 'yes' : 'no') : ''
            }
            isDisabled={disabled}
            placeholder={t('postMadeForKidsChoose')}
            options={[
              { value: 'no', label: t('postMadeForKidsNo') },
              { value: 'yes', label: t('postMadeForKidsYes') },
            ]}
            onChange={(choice) => setYouTube({ self_declared_made_for_kids: choice === 'yes' })}
          />
          <Text as="p" type="supporting">
            {t('postMadeForKidsHelp')}
          </Text>
          <CheckboxInput
            label={t('postSyntheticMedia')}
            value={youtubeOptions?.contains_synthetic_media ?? false}
            isDisabled={disabled || !youtubeOptions}
            onChange={(contains_synthetic_media) => setYouTube({ contains_synthetic_media })}
          />
          <Text as="p" type="supporting">
            {t('postSyntheticMediaHelp')}
          </Text>
        </VStack>
      )}
      {draft.saved && (
        <Selector
          label={t('postState')}
          value={draft.state}
          isDisabled={disabled}
          options={['draft', 'cancelled'].map((value) => ({
            value,
            label: t(`postState_${value}`),
          }))}
          onChange={(state) => setDraft({ ...draft, state: state as PostDraft['state'] })}
        />
      )}
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button
          label={t('catalogSave')}
          variant={draft.saved ? 'secondary' : 'primary'}
          isDisabled={
            disabled ||
            !draft.title.trim() ||
            !validPlan ||
            !validOptions ||
            (!draft.saved &&
              (!channels.some((channel) => channel.id === draft.channel_id) || !selectedExport)) ||
            (!form.dirty && !!draft.saved)
          }
          onClick={() => void save()}
        />
        <Button
          label={t('catalogReset')}
          isDisabled={disabled || !form.dirty}
          onClick={() => void form.reset()}
        />
        {form.dirty && <Text type="supporting">{t('catalogUnsaved')}</Text>}
      </HStack>
    </VStack>
  );
}
