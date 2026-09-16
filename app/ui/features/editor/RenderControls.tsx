import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { useTranslation } from 'react-i18next';
import { unwrap } from '../../bridge/client';
import { ProcessingOptions } from '../processing/ProcessingOptions';
import { ProfilePicker } from '../profiles/ProfilePicker';
import { useEditor } from './EditorContext';
import { TrimControls } from './video-tools/TrimControls';

export function RenderControls() {
  const { t } = useTranslation();
  const editor = useEditor();
  const compositionBlocked = Boolean(
    editor.composition && (editor.processing?.ocr || editor.processing?.inpaint),
  );
  const unavailable =
    compositionBlocked ||
    editor.busy ||
    editor.opening ||
    !editor.cap?.ffmpeg ||
    ((editor.cues.length > 0 || editor.processing?.ocr) && !editor.cap?.pysubs2) ||
    Boolean(editor.cues.length && editor.processing?.ocr);
  return (
    <>
      {compositionBlocked && (
        <p className="warning" role="status">
          {t('compositionAiUnavailable')}
        </p>
      )}
      <TrimControls />
      <ProfilePicker
        onApply={editor.changeProcessing}
        disabled={editor.busy || editor.opening}
        hasSubtitles={editor.cues.length > 0}
      />
      <ProcessingOptions
        showSubtitleStyle={false}
        value={editor.processing}
        onChange={editor.changeProcessing}
        disabled={editor.busy || editor.opening}
        hasSubtitles={editor.cues.length > 0}
      />
      <footer className="render-controls">
        <NumberInput
          label={t('sampleStart')}
          value={Number(editor.sampleStart)}
          min={0}
          step={0.1}
          width={144}
          isWheelEnabled={false}
          isDisabled={editor.opening}
          onChange={(value) => editor.changeSampleStart(String(value))}
        />
        <NumberInput
          label={t('sampleEnd')}
          value={Number(editor.sampleEnd)}
          min={0}
          step={0.1}
          width={144}
          isWheelEnabled={false}
          isDisabled={editor.opening}
          onChange={(value) => editor.changeSampleEnd(String(value))}
        />
        <Button
          label={t('sample')}
          variant="primary"
          type="button"
          isDisabled={unavailable}
          onClick={() => void editor.render('sample')}
        />
        <Button
          label={t('full')}
          type="button"
          isDisabled={unavailable}
          onClick={() => void editor.render('full')}
        />
        <span role="status">{editor.job ? t(editor.job.phase) : t(editor.status)}</span>
        {editor.job && (
          <Button
            label={t('cancel')}
            type="button"
            onClick={() => {
              if (editor.job)
                void unwrap(window.reupmatic.cancel(editor.job.id)).catch(editor.report);
            }}
          />
        )}
      </footer>
      <small>{t('batchNote')}</small>
    </>
  );
}
