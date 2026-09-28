import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayerCopyPreview,
  previewLayerCopy,
  staleLayerSource,
} from '../../../../core/subtitles/layers/commands';
import {
  getTextLayer,
  type TextLayerName,
  textLayerNames,
} from '../../../../core/subtitles/layers/document';
import { useEditor } from '../EditorContext';
import { ReviewGrid } from './ReviewGrid';

export function CopyLayerDialog({
  isOpen,
  onClose,
  preset,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Opens on this pair instead of the active layer, as when a panel routes a stale layer here. */
  preset?: { from: TextLayerName; to: TextLayerName };
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const [chosenFrom, setFrom] = useState<TextLayerName | null>(null);
  const from = chosenFrom ?? preset?.from ?? 'transcript';
  const [preview, setPreview] = useState<{ value: LayerCopyPreview; revision: number } | null>(
    null,
  );
  const [error, setError] = useState('');
  const to = preset?.to ?? editor.activeTextLayer;
  const staleSource = staleLayerSource(editor.textSnapshot, to);
  const drift = staleSource?.from === from ? staleSource.language : undefined;
  const applicable =
    preview &&
    preview.revision === editor.revision &&
    preview.value.from === from &&
    preview.value.to === to;
  const options = textLayerNames.map((value) => ({
    value,
    label: `${t(`textLayer_${value}`)} (${getTextLayer(editor.textSnapshot, value).cues.length})`,
  }));
  const previousCues = preview ? getTextLayer(editor.textSnapshot, preview.value.to).cues : [];

  function prepare() {
    setPreview(null);
    try {
      setPreview({
        value: previewLayerCopy(editor.textSnapshot, from, to),
        revision: editor.getRevision(),
      });
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'INVALID_TEXT_LAYERS');
    }
  }

  function close() {
    setPreview(null);
    setError('');
    if (preset) setFrom(null);
    onClose();
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && close()} purpose="form" width={640}>
      <DialogHeader title={t('textCopyTitle')} onOpenChange={(open) => !open && close()} />
      <VStack gap={3}>
        <Text as="p" type="body">
          {t('textCopyHelp', { target: t(`textLayer_${to}`) })}
        </Text>
        <HStack gap={2} vAlign="end" wrap="wrap">
          <Selector
            label={t('textCopyFrom')}
            value={from}
            options={options}
            onChange={(value) => {
              if (textLayerNames.includes(value as TextLayerName)) setFrom(value as TextLayerName);
            }}
          />
          <Button
            label={t('textCopyPreview')}
            isDisabled={from === to || editor.opening}
            onClick={prepare}
          />
        </HStack>
        {error && (
          <Banner
            status="error"
            title={t(
              error === 'TEXT_LAYER_STALE'
                ? 'textLayerStale'
                : error === 'TEXT_LAYER_EMPTY'
                  ? 'textLayerEmpty'
                  : error === 'TRANSLATION_LANGUAGE_MISMATCH'
                    ? 'translationLanguageMismatch'
                    : 'textLayerInvalid',
            )}
          />
        )}
        {preview && (
          <>
            <Text as="p" type="body" role="status">
              {t('textCopyCount', {
                count: preview.value.cues.length,
                target: t(`textLayer_${preview.value.to}`),
              })}
            </Text>
            {!applicable && (
              <Text as="p" type="body" role="status">
                {t('rulesStale')}
              </Text>
            )}
            <ReviewGrid
              ariaLabel={t('rulesComparison')}
              rowKey={(cue) => cue.id}
              rows={preview.value.cues}
              columns={[
                {
                  key: 'before',
                  header: t('rulesBefore'),
                  render: (cue) => {
                    const index = preview.value.cues.indexOf(cue);
                    return previousCues[index]?.text ?? '—';
                  },
                },
                { key: 'after', header: t('rulesAfter'), render: (cue) => cue.text },
              ]}
            />
            {drift && (
              <>
                <Text as="p" type="body">
                  {t('textLayerLanguageDrift', {
                    source: t(`textLayer_${from}`),
                    current: t(`visionLanguage_${drift.current}`),
                    expected: t(`visionLanguage_${drift.expected}`),
                  })}
                </Text>
                <Button
                  label={t('textLayerUseLanguage', {
                    language: t(`visionLanguage_${drift.expected}`),
                  })}
                  isDisabled={editor.opening}
                  onClick={() => {
                    const source = getTextLayer(editor.textSnapshot, from);
                    // The relabel changes the source, so the comparison is taken again.
                    if (editor.changeLayerCues(source.cues, from, { language: drift.expected }))
                      setPreview(null);
                  }}
                />
              </>
            )}
            {staleSource?.from === from && !drift && (
              <>
                <Text as="p" type="body">
                  {t('textKeepReviewedHelp')}
                </Text>
                <Button
                  label={t('textKeepReviewed')}
                  isDisabled={!applicable || editor.opening}
                  onClick={() => {
                    try {
                      editor.reviewLayerSource(preview.value, preview.revision);
                      close();
                    } catch (reason) {
                      editor.report(reason);
                    }
                  }}
                />
              </>
            )}
            <Button
              label={t('textCopyApply')}
              variant="primary"
              isDisabled={!applicable || editor.opening}
              onClick={() => {
                try {
                  editor.applyLayerCopy(preview.value, preview.revision);
                  close();
                } catch (reason) {
                  editor.report(reason);
                }
              }}
            />
          </>
        )}
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button label={t('cancel')} onClick={close} />
        </HStack>
      </VStack>
    </Dialog>
  );
}
