import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTextLayer } from '../../../../core/subtitles/layers/document';
import { InspectorPanelSection } from '../../../design-system/InspectorPanelSection';
import { useEditor } from '../../editor/EditorContext';
import { LayerLanguageField } from '../../editor/text-layers/LayerLanguageField';
import { synthesisErrorKey } from './error-message';
import { SynthesisReview } from './SynthesisReview';
import { useSynthesisJob } from './useSynthesisJob';

export function SynthesisPanel() {
  const { t } = useTranslation(),
    editor = useEditor();
  const source = getTextLayer(editor.textSnapshot, 'spoken');
  const job = useSynthesisJob({
    documentId: editor.documentId,
    revision: editor.revision,
    snapshot: editor.textSnapshot,
    opening: editor.opening,
  });
  const language = source.language;
  const [voice, setVoice] = useState(''),
    [scope, setScope] = useState<'all' | 'selected'>('selected');
  const [reviewBusy, setReviewBusy] = useState(false);
  const busy = Boolean(job.active) || job.settingUp || reviewBusy;
  const available =
    job.models?.available &&
    (language === 'en' || language === 'vi') &&
    job.models.languages.includes(language) &&
    job.models.voices.some((value) => value.id === voice);
  const languageUnsupported = language !== null && language !== 'en' && language !== 'vi';
  const selectionValid =
    editor.activeTextLayer === 'spoken' && source.cues.some((cue) => cue.id === editor.selected);
  return (
    <InspectorPanelSection title={t('synthesisTitle')}>
      <Text as="p" display="block" type="supporting">
        {t('synthesisLimits')}
      </Text>
      {}
      {(job.checking || !job.models?.available) && (
        <>
          <Text as="p" display="block" type="body" role="status">
            {job.checking
              ? t('visionChecking')
              : t(synthesisErrorKey(job.models?.code || 'MODEL_MISSING'))}
          </Text>
          <div className="action-row">
            {job.models && !job.models.available && (
              <Button
                size="sm"
                variant="secondary"
                label={t('setUp')}
                onClick={() => void editor.openSettings('processing')}
              />
            )}
            <Button
              size="sm"
              label={t('visionRefresh')}
              isDisabled={busy || job.checking}
              onClick={() => void job.refresh()}
            />
          </div>
        </>
      )}
      <div className="business-toolbar">
        <LayerLanguageField
          layerName="spoken"
          language={language}
          isDisabled={busy}
          onChange={(value) => editor.changeLayerCues(source.cues, 'spoken', { language: value })}
        />
        <Selector
          label={t('synthesisVoice')}
          value={voice}
          isDisabled={busy}
          options={[
            { value: '', label: t('synthesisChooseVoice') },
            ...(job.models?.voices ?? []).map((v) => ({ value: v.id, label: v.label })),
          ]}
          onChange={setVoice}
        />
        <Selector
          label={t('synthesisScope')}
          value={scope}
          isDisabled={busy}
          options={[
            { value: 'selected', label: t('synthesisSelected') },
            { value: 'all', label: t('synthesisAll') },
          ]}
          onChange={(value) => {
            if (value === 'all' || value === 'selected') setScope(value);
          }}
        />
      </div>
      {!available && job.models?.available && (
        <Text as="p" display="block" type="body" role="status">
          {t('synthesisVoiceMissing')}
        </Text>
      )}
      {scope === 'selected' && !selectionValid && (
        <Text as="p" display="block" type="body" role="status">
          {t('synthesisSelectionHelp')}
        </Text>
      )}
      {!source.cues.length && (
        <Text as="p" display="block" type="body" role="status">
          {t('textLayerEmpty')}
        </Text>
      )}
      {source.stale && <Banner status="warning" title={t('textLayerStale')} />}
      {languageUnsupported && <Banner status="warning" title={t('synthesisLanguageMismatch')} />}
      <Button
        label={t('synthesisStart')}
        variant="primary"
        isDisabled={
          busy ||
          editor.opening ||
          !available ||
          languageUnsupported ||
          source.stale ||
          !source.cues.length ||
          (scope === 'selected' && !selectionValid)
        }
        onClick={() =>
          (language === 'en' || language === 'vi') &&
          void job.start({
            language,
            voice_id: voice,
            ...(scope === 'selected' ? { cue_ids: [editor.selected] } : {}),
          })
        }
      />
      {job.active && (
        <div className="action-row" role="status">
          <ProgressBar
            label={t(job.active.phase)}
            max={1}
            value={job.active.fraction ?? undefined}
            isIndeterminate={job.active.fraction === null}
          />
          <Button
            label={t('cancel')}
            isDisabled={job.active.phase === 'cancelling'}
            onClick={() => void job.cancel()}
          />
        </div>
      )}
      {job.error && (
        <Banner
          status="error"
          title={t(synthesisErrorKey(job.error))}
          description={<code>{job.error}</code>}
        />
      )}
      {job.draft && (
        <SynthesisReview
          key={job.draft.input.request_id}
          draft={job.draft}
          disabled={Boolean(job.active) || job.settingUp}
          onBusy={setReviewBusy}
        />
      )}
    </InspectorPanelSection>
  );
}
