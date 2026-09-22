import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack } from '@astryxdesign/core/Layout';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { Selector } from '@astryxdesign/core/Selector';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { ClipboardPaste } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DouyinDownloadRequestItem } from '../../../../core/host-bridge/operations/sources';
import {
  bestQualityTierIndex,
  DOUYIN_CANDIDATE_SORTS,
  DOUYIN_DURATION_PRESETS,
  DOUYIN_RESOLUTION_PRESETS,
  DOUYIN_VIEW_PRESETS,
  type DouyinCandidateQuery,
  EMPTY_CANDIDATE_QUERY,
  viewDouyinCandidates,
} from '../../../../core/sources/douyin-candidates';
import type { DouyinItem } from '../../../../core/sources/douyin-discovery-contracts';
import { DouyinCandidateTable } from './DouyinCandidateTable';
import { useDouyinDownloads } from './DouyinDownloadsContext';
import { douyinFailureKey } from './error-message';
import { SavedChannels } from './SavedChannels';
import { useDouyinChannels } from './useDouyinChannels';
import { useDouyinClipboard } from './useDouyinClipboard';
import type { useDouyinSearch } from './useDouyinSearch';

interface Props {
  search: ReturnType<typeof useDouyinSearch>;
  connected: boolean;
  disabled: boolean;
  onReconnect(): Promise<unknown>;
  onVerify(): Promise<unknown>;
}

export function DouyinSearchPanel({ search, connected, disabled, onReconnect, onVerify }: Props) {
  const { t } = useTranslation();
  const downloads = useDouyinDownloads();
  const clipboard = useDouyinClipboard();
  const channels = useDouyinChannels();
  useEffect(() => {
    if (search.outcome) void channels.reload();
  }, [search.outcome, channels.reload]);
  const [draft, setDraft] = useState('');
  const [clipboardNote, setClipboardNote] = useState('');
  const [query, setQuery] = useState<DouyinCandidateQuery>(EMPTY_CANDIDATE_QUERY);
  const busy = disabled || search.busy;
  const downloading = downloads.busy;

  const candidatesById = new Map<string, DouyinItem>();
  if (search.result?.exact) candidatesById.set(search.result.exact.awemeId, search.result.exact);
  for (const video of search.result?.videos ?? []) candidatesById.set(video.awemeId, video);

  const downloadState = (awemeId: string) =>
    downloads.snapshot?.items.find((item) => item.awemeId === awemeId)?.state;

  async function downloadSelected(saveTo?: boolean) {
    const items = [...search.selected]
      .map((awemeId) => candidatesById.get(awemeId))
      .filter((item): item is DouyinItem => Boolean(item))
      .map((item) => ({ aweme_id: item.awemeId, tier_index: bestQualityTierIndex(item) }));
    if (items.length === 0) return;
    await downloads.start(items, saveTo);
  }

  async function downloadOne(item: DouyinItem) {
    await downloads.start([{ aweme_id: item.awemeId, tier_index: bestQualityTierIndex(item) }]);
  }

  const lastSearch = useRef('');

  async function runSearch(text: string) {
    lastSearch.current = text;
    setQuery(EMPTY_CANDIDATE_QUERY);
    await search.run(text);
  }

  async function reconnectAndResume() {
    await onReconnect();
    if (lastSearch.current) await runSearch(lastSearch.current);
  }

  async function verifyAndResume() {
    await onVerify();
    if (lastSearch.current) await runSearch(lastSearch.current);
  }

  async function verifyDownloadsAndRetry(awemeIds: readonly string[]) {
    await onVerify();
    const items: DouyinDownloadRequestItem[] = [];
    for (const awemeId of awemeIds) {
      const item = candidatesById.get(awemeId);
      if (item) items.push({ aweme_id: awemeId, tier_index: bestQualityTierIndex(item) });
    }
    if (items.length > 0) await downloads.start(items);
  }

  async function fromClipboard() {
    setClipboardNote('');
    try {
      const text = await clipboard.read();
      if (!text.trim()) {
        setClipboardNote(t('douyinSearchEmptyClipboard'));
        return;
      }
      setDraft(text);
      await runSearch(text);
    } catch {
      setClipboardNote(t('douyinSearchEmptyClipboard'));
    }
  }

  async function fromInput() {
    const text = draft;
    if (!text.trim()) return;
    setClipboardNote('');
    await runSearch(text);
  }

  const result = search.result;
  const outcome = search.outcome;
  const workingList: DouyinItem[] = [];
  if (result?.exact) workingList.push(result.exact);
  for (const video of result?.videos ?? []) {
    if (!workingList.some((item) => item.awemeId === video.awemeId)) workingList.push(video);
  }
  const view = result ? viewDouyinCandidates(workingList, query) : null;
  const options = (prefix: string, values: readonly string[]) =>
    values.map((value) => ({ value, label: t(`${prefix}${value}`) }));

  const verificationStopped = (downloads.snapshot?.items ?? []).filter(
    (item) => item.state === 'failed' && item.code === 'DOUYIN_VERIFICATION_REQUIRED',
  );

  return (
    <VStack gap={3}>
      <section className="downloads-search" aria-label={t('douyinSearchTitle')}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <TextInput
                label={t('douyinSearchFieldLabel')}
                isLabelHidden
                placeholder={t('douyinSearchFieldLabel')}
                hasClear
                value={draft}
                isDisabled={!connected || busy}
                onChange={setDraft}
                onEnter={() => void fromInput()}
              />
            </StackItem>
            <Button
              variant="primary"
              label={t('douyinSearchSubmit')}
              isLoading={search.busy}
              isDisabled={!connected || busy || draft.trim().length === 0}
              onClick={() => void fromInput()}
            />
            {}
            {clipboard.hasText && (
              <IconButton
                variant="secondary"
                label={t('douyinSearchClipboard')}
                tooltip={t('douyinSearchClipboard')}
                icon={<Icon icon={ClipboardPaste} size="sm" />}
                isDisabled={!connected || busy}
                onClick={() => void fromClipboard()}
              />
            )}
          </HStack>
          {clipboardNote && (
            <Text as="p" type="supporting" role="status">
              {clipboardNote}
            </Text>
          )}
          {search.error && <Banner status="error" title={t('downloadsSessionError')} />}
          {outcome?.status === 'unsupported' && (
            <Banner status="error" title={t(outcome.reasonKey)} />
          )}
          {outcome?.status === 'failure' && (
            <Banner
              status="error"
              title={t(douyinFailureKey(outcome.failure.kind))}
              endContent={
                outcome.failure.kind === 'login_required' ? (
                  <Button
                    label={t('downloadsReconnect')}
                    isDisabled={busy}
                    onClick={() => void reconnectAndResume()}
                  />
                ) : outcome.failure.kind === 'verification_required' ? (
                  <Button
                    label={t('douyinSearchVerifyOpen')}
                    isDisabled={busy}
                    onClick={() => void verifyAndResume()}
                  />
                ) : undefined
              }
            />
          )}
        </VStack>
      </section>

      <SavedChannels
        channels={channels.list}
        disabled={!connected || busy}
        onScan={(secUid) => void runSearch(`https://www.douyin.com/user/${secUid}`)}
        onAdd={(text) => void runSearch(text)}
      />

      {result && (
        <VStack gap={2}>
          {result.partialFailure && (
            <Banner
              status="warning"
              title={t('douyinSearchPartial')}
              description={t(douyinFailureKey(result.partialFailure.kind))}
              endContent={
                result.partialFailure.kind === 'verification_required' ? (
                  <Button
                    label={t('douyinSearchVerifyOpen')}
                    isDisabled={busy}
                    onClick={() => void verifyAndResume()}
                  />
                ) : undefined
              }
            />
          )}
          <Text type="supporting" role="status">
            {t('douyinSearchRetrieved', { count: workingList.length })}
            {result.mayHaveMore ? ` — ${t('douyinSearchMayHaveMore')}` : ''}
            {result.truncated ? ` — ${t('douyinSearchTruncated')}` : ''}
          </Text>
          {workingList.length === 0 ? (
            <Text type="body">{t('douyinSearchNoCandidates')}</Text>
          ) : (
            <VStack gap={2}>
              <section className="downloads-filters" aria-label={t('douyinSearchSort')}>
                <MultiSelector
                  label={t('libraryFilterMediaType')}
                  isLabelHidden
                  variant="ghost"
                  size="sm"
                  hasClear
                  placeholder={t('libraryFilterMediaType')}
                  options={options('libraryFilterMedia_', ['video', 'image', 'slides'])}
                  value={query.media_types}
                  isDisabled={busy}
                  onChange={(value) =>
                    setQuery({
                      ...query,
                      media_types: value as DouyinCandidateQuery['media_types'],
                    })
                  }
                />
                <Selector
                  label={t('libraryFilterDuration')}
                  isLabelHidden
                  variant="ghost"
                  size="sm"
                  hasClear
                  placeholder={t('libraryFilterDuration')}
                  options={options('douyinFilterDuration_', DOUYIN_DURATION_PRESETS)}
                  value={query.duration || null}
                  isDisabled={busy || !view?.facets.duration}
                  disabledMessage={t('douyinFilterNoValues')}
                  onChange={(value) =>
                    setQuery({
                      ...query,
                      duration: (value ?? '') as DouyinCandidateQuery['duration'],
                    })
                  }
                />
                <Selector
                  label={t('libraryFilterResolution')}
                  isLabelHidden
                  variant="ghost"
                  size="sm"
                  hasClear
                  placeholder={t('libraryFilterResolution')}
                  options={options('libraryFilterResolution_', DOUYIN_RESOLUTION_PRESETS)}
                  value={query.resolution || null}
                  isDisabled={busy || !view?.facets.resolution}
                  disabledMessage={t('douyinFilterNoValues')}
                  onChange={(value) =>
                    setQuery({
                      ...query,
                      resolution: (value ?? '') as DouyinCandidateQuery['resolution'],
                    })
                  }
                />
                <Selector
                  label={t('douyinFilterViews')}
                  isLabelHidden
                  variant="ghost"
                  size="sm"
                  hasClear
                  placeholder={t('douyinFilterViews')}
                  options={options('douyinFilterViews_', DOUYIN_VIEW_PRESETS)}
                  value={query.min_views || null}
                  isDisabled={busy || !view?.facets.views}
                  disabledMessage={t('douyinFilterNoValues')}
                  onChange={(value) =>
                    setQuery({
                      ...query,
                      min_views: (value ?? '') as DouyinCandidateQuery['min_views'],
                    })
                  }
                />
                <Selector
                  label={t('douyinSearchSort')}
                  isLabelHidden
                  variant="ghost"
                  size="sm"
                  placeholder={t('douyinSearchSort')}
                  options={options('douyinSearchSort_', DOUYIN_CANDIDATE_SORTS)}
                  value={query.sort}
                  isDisabled={busy}
                  onChange={(value) =>
                    setQuery({ ...query, sort: value as DouyinCandidateQuery['sort'] })
                  }
                />
              </section>
              {view && view.items.length === 0 ? (
                <VStack gap={1} align="center" paddingBlock={4}>
                  <Text as="p" type="body" role="status">
                    {t('libraryFilterEmpty')}
                  </Text>
                  <Button
                    variant="secondary"
                    label={t('libraryFilterClearAll')}
                    onClick={() => setQuery(EMPTY_CANDIDATE_QUERY)}
                  />
                </VStack>
              ) : (
                view && (
                  <DouyinCandidateTable
                    items={view.items}
                    selected={search.selected}
                    exactId={result.exact?.awemeId}
                    disabled={busy || downloading}
                    stateOf={downloadState}
                    onToggle={search.toggle}
                    onDownload={(item) => void downloadOne(item)}
                  />
                )
              )}
            </VStack>
          )}
          {downloads.error && <Banner status="error" title={t('douyinDownloadFailed')} />}
          {verificationStopped.length > 0 && (
            <Banner
              status="error"
              title={t('douyinDownloadFailed')}
              description={t('douyinSearchFailureVerificationRequired')}
              endContent={
                <Button
                  label={t('douyinSearchVerifyOpen')}
                  isDisabled={busy || downloading}
                  onClick={() =>
                    void verifyDownloadsAndRetry(verificationStopped.map((item) => item.awemeId))
                  }
                />
              }
            />
          )}
          {search.selected.size > 0 && (
            <div className="library-selection-bar" role="status">
              <Text type="body">{t('librarySelection', { count: search.selected.size })}</Text>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Button
                  variant="primary"
                  label={t('douyinDownloadSelected')}
                  isLoading={downloading}
                  isDisabled={busy || downloading}
                  onClick={() => void downloadSelected()}
                />
                <Button
                  variant="secondary"
                  label={t('douyinDownloadSaveTo')}
                  isDisabled={busy || downloading}
                  onClick={() => void downloadSelected(true)}
                />
                {downloading && (
                  <Button
                    variant="secondary"
                    label={t('douyinDownloadCancel')}
                    onClick={() => void downloads.cancel()}
                  />
                )}
                <Button
                  variant="secondary"
                  label={t('libraryClearSelection')}
                  isDisabled={downloading}
                  onClick={search.clearSelection}
                />
              </HStack>
            </div>
          )}
        </VStack>
      )}
    </VStack>
  );
}
