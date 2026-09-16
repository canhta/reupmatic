import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { useTranslation } from 'react-i18next';
import { useEditor } from './EditorContext';

export function MediaStage() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { media, preview, revision, ass } = editor;
  if (!media) return null;
  return (
    <div className="viewers">
      <h2>{t(editor.composition ? 'compositionSourcePreview' : 'original')}</h2>
      {editor.sourceSelection && <small>{editor.sourceSelection.name}</small>}
      <div className="video-tray">
        <div className="video-wrap">
          <video
            key={editor.composition ? editor.sourceSelection?.id ?? 'loading' : media.asset_id}
            ref={editor.video}
            src={editor.sourceUrl}
            onLoadedMetadata={editor.onSourceMetadata}
            controls
            onTimeUpdate={event => editor.onSourceTime(Math.round(event.currentTarget.currentTime * 1000))}
            onError={() => editor.setError('PREVIEW_UNAVAILABLE')}
          />
        </div>
      </div>
      <small>{editor.composition ? t('compositionPreviewHelp') : ass?.revision !== revision ? t('stale') : t('previewNotice')}</small>
      <h2>{t('processed')}</h2>
      {preview && preview.revision !== revision && <p className="stale-preview">{t('stale')}</p>}
      {preview ? (
        <>
          <video src={preview.url} controls loop />
          <div className="preview-actions">
            <Button label={t('saveVideo')} onClick={() => void editor.saveVideo(preview.artifact_id)} />
          </div>
        </>
      ) : <EmptyState className="no-preview" title={t('noPreview')} />}
    </div>
  );
}
