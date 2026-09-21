import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayerCopyPreview,
  previewLayerCopy,
} from '../../../../core/subtitles/layers/commands';
import {
  getTextLayer,
  type TextLayerName,
  textLayerNames,
} from '../../../../core/subtitles/layers/document';
import { useEditor } from '../EditorContext';
import { ReviewGrid } from './ReviewGrid';

/**
 * "Copy from another layer" (#10 in the control inventory): an occasional
 * bulk operation, reached from the cue list's overflow menu rather than a
 * permanently open panel (§4.3 D2).
 */
export function CopyLayerDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const [from, setFrom] = useState<TextLayerName>('transcript');
  const [preview, setPreview] = useState<{ value: LayerCopyPreview; revision: number } | null>(
    null,
  );
  const [error, setError] = useState('');
  const to = editor.activeTextLayer;
  const layer = editor.activeLayer;
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
    onClose();
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && close()} purpose="form" width={640}>
      <DialogHeader title={t('textCopyTitle')} onOpenChange={(open) => !open && close()} />
      <div className="business-form">
        <Text as="p" type="body">
          {t('textCopyHelp', { target: t(`textLayer_${to}`) })}
        </Text>
        <div className="business-toolbar">
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
        </div>
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
            description={<code>{error}</code>}
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
            {layer.stale &&
              (layer.origin.kind === 'copy' || layer.origin.kind === 'translation') &&
              layer.origin.layer === from && (
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
        <div className="action-row">
          <Button label={t('cancel')} onClick={close} />
        </div>
      </div>
    </Dialog>
  );
}
