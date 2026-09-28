import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useTranslation } from 'react-i18next';
import type { ExportChoice, Post } from '../../../core/distribution/distribution-contracts';
import { readPlanDraft } from '../../../core/distribution/post-schedule';
import {
  CommandFooter,
  type CommandStatus,
  PanelRow,
  PanelRows,
  PanelSection,
  PanelSections,
  PanelToggleProvider,
  ToggleRow,
  ValueRow,
} from '../../design-system/Panel';
import { useCatalog } from '../catalog/CatalogProvider';
import type { useRecordDraft } from '../catalog/useRecordDraft';
import { PostPlanFields } from './PostPlanFields';
import { PostPreview } from './PostPreview';
import { PostPublication, type PostPublicationModel } from './PostPublication';
import { type PostDraft, postDraft } from './post-draft';
import { type TikTokCreator, TikTokDisclosure, TikTokPostOptions } from './TikTokPostOptions';

type PostForm = ReturnType<typeof useRecordDraft<PostDraft>>;

function usePostEditorModel(form: PostForm, exports: ExportChoice[]) {
  const catalog = useCatalog();
  const { value: draft } = form;
  const disabled = catalog.busy || !catalog.snapshot;
  const selectedExport = exports.find((item) => item.export_id === draft.export_id);
  const channels = catalog.snapshot?.channels.filter((channel) => !channel.archived) ?? [];
  const links = catalog.snapshot?.links.filter((link) => !link.archived) ?? [];
  const selectedChannel =
    channels.find((channel) => channel.id === draft.channel_id) ?? draft.saved?.channel;
  const isYouTube = selectedChannel?.platform === 'youtube';
  const youtubeOptions = draft.options.youtube;
  const isTikTok = selectedChannel?.platform === 'tiktok';
  const tiktokOptions = draft.options.tiktok;
  const disclosureMissing =
    isTikTok &&
    !!tiktokOptions?.disclose &&
    !tiktokOptions.brand_content_toggle &&
    !tiktokOptions.brand_organic_toggle;
  const tiktokReady =
    !isTikTok ||
    (tiktokOptions !== null &&
      !!tiktokOptions.privacy_level &&
      !disclosureMissing &&
      !(tiktokOptions.brand_content_toggle && tiktokOptions.privacy_level === 'SELF_ONLY'));
  const validOptions = (!isYouTube || youtubeOptions !== null) && tiktokReady;
  let validPlan = true;
  try {
    readPlanDraft(draft.plan);
  } catch {
    validPlan = false;
  }
  return {
    catalog,
    draft,
    disabled,
    selectedExport,
    channels,
    links,
    isYouTube,
    youtubeOptions,
    isTikTok,
    tiktokOptions,
    disclosureMissing,
    validOptions,
    validPlan,
  };
}

// The drawer body: fields and details only, in the composer order of Meta Business Suite (post
// to, details, platform options, scheduling). The actions live in PostEditorFooter.
export function PostEditor({
  form,
  exports,
  loadError,
  publication,
  creator,
}: {
  form: PostForm;
  exports: ExportChoice[];
  loadError: boolean;
  publication: PostPublicationModel;
  creator: TikTokCreator;
}) {
  const { t } = useTranslation();
  const {
    draft,
    disabled,
    selectedExport,
    channels,
    links,
    isYouTube,
    youtubeOptions,
    isTikTok,
    tiktokOptions,
  } = usePostEditorModel(form, exports);
  // TikTok asks for a preview of the video before it is posted.
  const preview = !isTikTok
    ? null
    : draft.saved
      ? { libraryId: draft.saved.export.library_id, exportId: draft.saved.export.link_id }
      : selectedExport
        ? { libraryId: selectedExport.library_id, exportId: selectedExport.export_id }
        : null;
  const { setValue: setDraft } = form;

  function setYouTube(patch: Partial<NonNullable<typeof youtubeOptions>>) {
    setDraft({
      ...draft,
      options: {
        ...draft.options,
        youtube: {
          self_declared_made_for_kids: youtubeOptions?.self_declared_made_for_kids ?? false,
          contains_synthetic_media: youtubeOptions?.contains_synthetic_media ?? false,
          ...patch,
        },
      },
    });
  }

  function setTikTok(tiktok: NonNullable<typeof tiktokOptions>) {
    setDraft({ ...draft, options: { ...draft.options, tiktok } });
  }

  return (
    <PanelToggleProvider value={CheckboxInput}>
      <PanelSections>
        <PanelSection title={t('postSectionTarget')}>
          {!draft.saved ? (
            <PanelRows>
              <Selector
                label={t('postDestination')}
                value={draft.channel_id}
                isDisabled={disabled}
                placeholder={t('postChooseChannel')}
                options={channels.map((channel) => ({ value: channel.id, label: channel.name }))}
                onChange={(channel_id) =>
                  setDraft({ ...draft, channel_id, options: { youtube: null, tiktok: null } })
                }
              />
              <Selector
                label={t('postExport')}
                value={draft.export_id}
                isDisabled={disabled || loadError}
                placeholder={t(
                  exports.length || loadError ? 'postChooseExport' : 'postExportsEmpty',
                )}
                options={exports.map((item) => ({
                  value: item.export_id,
                  label: `${item.content_name} — ${item.name}`,
                }))}
                onChange={(export_id) => setDraft({ ...draft, export_id })}
              />
              <MultiSelector
                label={t('postLinks')}
                value={draft.link_ids}
                isDisabled={disabled}
                placeholder={t('postLinksOptional')}
                hasSearch
                triggerDisplay="labels"
                options={links.map((link) => ({
                  value: link.id,
                  label: `${link.name} — ${link.url}`,
                }))}
                emptyText={t('affiliateEmpty')}
                emptySearchText={t('catalogNoMatches')}
                searchPlaceholder={t('catalogSearch')}
                onChange={(link_ids) => setDraft({ ...draft, link_ids })}
              />
              {preview && <PostPreview {...preview} />}
            </PanelRows>
          ) : (
            <PanelRows>
              <ValueRow label={t('postDestination')}>{draft.saved.channel.name}</ValueRow>
              <ValueRow label={t('postExport')}>{draft.saved.export.name}</ValueRow>
              <ValueRow label={t('postLinks')}>
                {draft.saved.links.length
                  ? draft.saved.links.map((link) => (
                      <Text as="p" type="body" maxLines={1} key={link.id}>
                        {link.name} — {link.url}
                      </Text>
                    ))
                  : t('postNoLinks')}
              </ValueRow>
              {preview && <PostPreview {...preview} />}
            </PanelRows>
          )}
        </PanelSection>
        <PanelSection title={t('postSectionDetails')}>
          <PanelRows>
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
            {draft.saved && (
              <PanelRow label={t('postState')}>
                <SegmentedControl
                  label={t('postState')}
                  layout="fill"
                  value={draft.state}
                  isDisabled={disabled}
                  onChange={(state) => setDraft({ ...draft, state: state as PostDraft['state'] })}
                >
                  <SegmentedControlItem value="draft" label={t('postState_draft')} />
                  <SegmentedControlItem value="cancelled" label={t('postState_cancelled')} />
                </SegmentedControl>
              </PanelRow>
            )}
          </PanelRows>
        </PanelSection>
        {isYouTube && (
          <PanelSection title={t('platform_youtube')}>
            <PanelRows>
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
              <ToggleRow
                label={t('postSyntheticMedia')}
                value={youtubeOptions?.contains_synthetic_media ?? false}
                isDisabled={disabled || !youtubeOptions}
                onChange={(contains_synthetic_media) => setYouTube({ contains_synthetic_media })}
              />
            </PanelRows>
          </PanelSection>
        )}
        {isTikTok && (
          <TikTokPostOptions
            creator={creator}
            value={tiktokOptions}
            onChange={setTikTok}
            disabled={disabled}
          />
        )}
        {isTikTok && (
          <TikTokDisclosure
            creator={creator}
            value={tiktokOptions}
            onChange={setTikTok}
            disabled={disabled}
          />
        )}
        <PostPlanFields
          value={draft.plan}
          onChange={(plan) => setDraft({ ...draft, plan })}
          disabled={disabled}
        />
        {draft.saved && publication.hasDetails && (
          <PostPublication post={draft.saved} model={publication} />
        )}
      </PanelSections>
    </PanelToggleProvider>
  );
}

// The drawer footer: the publication state, one primary (Save while new or dirty, else Publish),
// Discard while dirty, and the rare publication actions in its menu.
export function PostEditorFooter({
  form,
  exports,
  loadError,
  onRetry,
  publication,
  creator,
  onSaved,
}: {
  form: PostForm;
  exports: ExportChoice[];
  loadError: boolean;
  onRetry(): void;
  publication: PostPublicationModel;
  creator: TikTokCreator;
  onSaved(post: Post): void;
}) {
  const { t } = useTranslation();
  const {
    catalog,
    draft,
    disabled,
    selectedExport,
    channels,
    disclosureMissing,
    validOptions,
    validPlan,
  } = usePostEditorModel(form, exports);
  const {
    channel,
    platform,
    supported,
    phase,
    blocking,
    problems,
    publishing,
    checking,
    progress,
    showPublish,
    showCheck,
    canOpen,
    publish,
    check,
    openRemote,
  } = publication;
  const showSave = !draft.saved || form.dirty;
  const showStatus = showCheck || phase === 'failed';
  // One Retry for every failed load: the video list and TikTok's creator settings.
  const retry: DropdownMenuOption[] =
    (!draft.saved && loadError) || creator.error
      ? [
          {
            label: t('retryLoad'),
            onClick: () => {
              if (!draft.saved && loadError) onRetry();
              if (creator.error) creator.retry();
            },
          },
        ]
      : [];
  const menu: DropdownMenuOption[] = draft.saved
    ? [
        ...retry,
        ...(retry.length ? [{ type: 'divider' as const }] : []),
        ...(canOpen
          ? [{ label: t('postOpenPost'), isDisabled: disabled, onClick: () => void openRemote() }]
          : []),
        ...(showStatus
          ? [
              {
                label: t('postCheckStatus'),
                isDisabled: disabled || checking || publishing,
                onClick: () => void check(),
              },
            ]
          : []),
        ...(canOpen || showStatus ? [{ type: 'divider' as const }] : []),
        {
          label: t('batchShowOutput'),
          isDisabled: disabled,
          onClick: () => void catalog.mutate(() => window.reupmatic.postReveal(draft.id)),
        },
      ]
    : retry;

  // One line: a saved post's publication state, or why a new post has no video to pick.
  function footerStatus(): CommandStatus | null {
    if (!draft.saved) return loadError ? { tone: 'error', text: t('postExportsError') } : null;
    if (!supported || !channel) return null;
    if (phase === 'published' || phase === 'scheduled')
      return { tone: 'success', text: t(`publishPhase_${phase}`) };
    if (phase === 'failed') return { tone: 'error', text: t('publishPhase_failed') };
    if (phase === 'unknown') return { tone: 'warning', text: t('postPublicationUnknown') };
    if (phase) return { tone: 'neutral', text: t(`publishPhase_${phase}`) };
    if (!channel.can_publish) return { tone: 'warning', text: t('postConnectionRequired') };
    if (showPublish && problems === null)
      return { tone: 'neutral', text: t('postPreflightLoading') };
    return { tone: 'neutral', text: t('postNotPublished') };
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
    <CommandFooter
      status={footerStatus()}
      menu={menu}
      active={publishing ? { phase: 'publishPhase_uploading', fraction: progress } : null}
    >
      {form.dirty && (
        <Button label={t('catalogReset')} isDisabled={disabled} onClick={() => void form.reset()} />
      )}
      {showSave ? (
        <Button
          label={t('catalogSave')}
          variant="primary"
          tooltip={disclosureMissing ? t('tiktokDisclosureRequired') : undefined}
          isDisabled={
            disabled ||
            !draft.title.trim() ||
            !validPlan ||
            !validOptions ||
            (!draft.saved &&
              (!channels.some((channel) => channel.id === draft.channel_id) || !selectedExport))
          }
          onClick={() => void save()}
        />
      ) : showPublish ? (
        <Button
          label={
            draft.saved?.planned && platform !== 'tiktok'
              ? t('postPublishScheduled')
              : t('postPublish')
          }
          variant="primary"
          tooltip={disclosureMissing ? t('tiktokDisclosureRequired') : undefined}
          isDisabled={
            disabled ||
            publishing ||
            blocking.length > 0 ||
            problems === null ||
            disclosureMissing ||
            (platform === 'tiktok' && creator.settings === null)
          }
          onClick={() => void publish()}
        />
      ) : null}
    </CommandFooter>
  );
}
