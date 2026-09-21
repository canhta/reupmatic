import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { Pause, Play } from 'lucide-react';
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { colorPreviewMatrix } from '../../../core/editing/color-preview';
import { resolveEditWindow } from '../../../core/editing/edit-recipe';
import { fadePreviewOpacity } from '../../../core/editing/fade-preview';
import { geometryPreview } from '../../../core/editing/geometry-preview';
import { logoPreview } from '../../../core/editing/logo-preview';
import { useEditor } from './EditorContext';

const SAMPLE_RANGE_INPUT_WIDTH = 112;

// Mirrors the worker's FFmpeg `eq`; Source only — a rendered sample already has it baked in.
const COLOR_PREVIEW_FILTER_ID = 'editor-color-preview';

type MonitorMode = 'source' | 'preview';

function MonitorTransport({
  isPlaying,
  at,
  of,
  onToggle,
}: {
  isPlaying: boolean;
  at: number;
  of: number;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="monitor-transport">
      <IconButton
        label={isPlaying ? t('monitorPause') : t('monitorPlay')}
        tooltip={isPlaying ? t('monitorPause') : t('monitorPlay')}
        size="sm"
        variant="ghost"
        icon={<Icon icon={isPlaying ? Pause : Play} size="sm" />}
        onClick={onToggle}
      />
      <Text type="supporting" as="span" className="monitor-clock">
        {`${clockText(at)} / ${clockText(of)}`}
      </Text>
    </div>
  );
}

function clockText(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

export function MediaStage({ isWide }: { isWide: boolean }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const { media, preview, revision, ass, documentId } = editor;
  const { color, crop, flip, rotate, fade, logo, output } = editor.processing?.editing ?? {};
  const [mode, setMode] = useState<MonitorMode>('source');
  const [logoAspect, setLogoAspect] = useState<number | null>(null);
  const geometry = useMemo(
    () =>
      media
        ? geometryPreview(
            { crop, flip, rotate, output },
            { width: media.width, height: media.height },
          )
        : null,
    [media, crop, flip, rotate, output],
  );
  const staged =
    geometry != null &&
    (rotate !== undefined ||
      flip !== undefined ||
      crop !== undefined ||
      fade !== undefined ||
      logo !== undefined ||
      Math.abs(geometry.outputAspect - geometry.contentAspect) > 1e-9);
  // Matches the box the worker's `overlay` draws over the output frame.
  const logoBox =
    logo && logoAspect && geometry
      ? logoPreview(
          logo,
          { width: logoAspect, height: 1 },
          { width: geometry.outputAspect, height: 1 },
        )
      : null;
  const fadeOpacity = (() => {
    if (!fade || !media || mode === 'preview') return 1;
    try {
      const window = resolveEditWindow(editor.processing?.editing, editor.duration);
      const outputMs = Math.max(
        0,
        Math.min(window.duration_ms, (editor.clock - window.start_ms) / window.speed),
      );
      return fadePreviewOpacity(fade, outputMs, window.duration_ms);
    } catch {
      return 1;
    }
  })();
  const [dragOver, setDragOver] = useState(false);
  const [playing, setPlaying] = useState(false);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const [previewClock, setPreviewClock] = useState({ at: 0, of: 0 });
  const lastPreviewId = useRef<string | null>(null);
  // Adjusting state during render (react.dev), not an Effect; each branch fires once per real change.
  const [seenDocumentId, setSeenDocumentId] = useState(documentId);
  if (documentId !== seenDocumentId) {
    setSeenDocumentId(documentId);
    setMode('source');
    lastPreviewId.current = null;
  } else if (preview && preview.artifact_id !== lastPreviewId.current) {
    lastPreviewId.current = preview.artifact_id;
    setMode('preview');
  }

  // A cancelled open must not strand focus on <body> after the busy button blurs.
  const wasOpening = useRef(false);
  useEffect(() => {
    if (editor.opening) {
      wasOpening.current = true;
      return;
    }
    if (wasOpening.current && !media && document.activeElement === document.body) {
      document.getElementById('editor-start-drop-target')?.focus();
    }
    wasOpening.current = false;
  }, [editor.opening, media]);

  const sourceStale = media != null && !editor.composition && ass?.revision !== revision;
  const previewStale =
    media != null && mode === 'preview' && preview != null && preview.revision !== revision;
  const stale = mode === 'source' ? sourceStale : previewStale;

  return (
    <div className="viewers">
      <div className="monitor-header">
        <div className="monitor-header-title">
          {isWide ? (
            <Heading level={5} maxLines={1}>
              {t('monitorTitle')}
            </Heading>
          ) : (
            <VisuallyHidden as="h5">{t('monitorTitle')}</VisuallyHidden>
          )}
        </div>
        {stale && (
          <div className="monitor-header-badge">
            <Tooltip content={t('staleHelp')}>
              <Badge variant="warning" label={t('stale')} />
            </Tooltip>
          </div>
        )}
        <div className="monitor-mode-switch">
          <SegmentedControl
            label={t('monitorModeLabel')}
            value={mode}
            isDisabled={!media}
            onChange={(value) => setMode(value as MonitorMode)}
            size="sm"
          >
            <SegmentedControlItem value="source" label={t('monitorSource')} />
            <SegmentedControlItem value="preview" label={t('monitorPreview')} />
          </SegmentedControl>
          <Button
            label={t('sample')}
            size="sm"
            isDisabled={!media || editor.renderUnavailable}
            onClick={() => void editor.render('sample')}
          />
        </div>
      </div>
      {mode === 'source' && editor.sourceSelection && (
        <Text as="p" type="supporting" className="monitor-source-name">
          {editor.sourceSelection.name}
        </Text>
      )}
      <div className="video-tray">
        <div className="video-wrap">
          {color && (
            <svg className="color-preview-defs" aria-hidden="true">
              <filter id={COLOR_PREVIEW_FILTER_ID} colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values={colorPreviewMatrix(color).join(' ')} />
              </filter>
            </svg>
          )}
          {!media ? (
            // biome-ignore lint/a11y/noStaticElementInteractions: a drag-and-drop target, not a click/keyboard control — Project media Add… and File > Import Media… stay the keyboard-operable ways to add media; this only adds an alternate pointer/drag path.
            <div
              id="editor-start-drop-target"
              className={`editor-start-frame${dragOver ? ' editor-start-frame--drag-over' : ''}`}
              tabIndex={-1}
              onDragOver={(event: DragEvent<HTMLDivElement>) => {
                if (!event.dataTransfer?.types.includes('Files')) return;
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault();
                setDragOver(false);
                const file = event.dataTransfer?.files[0];
                if (!file) return;
                // Preload hook resolves the dropped File to a real path; openPath validates and registers it.
                const path = window.reupmatic.getPathForFile(file);
                if (path) void editor.openPath(path);
              }}
            >
              <EmptyState isCompact className="video-placeholder" title={t('openHint')} />
            </div>
          ) : mode === 'source' ? (
            editor.sourceUrl ? (
              staged && geometry ? (
                // Numbers come from geometryPreview, the same recipe the worker's filter chain consumes.
                <div className="geometry-stage">
                  <div
                    className="geometry-frame"
                    style={{
                      width: `min(100cqw, 100cqh * ${geometry.outputAspect})`,
                      height: `min(100cqh, 100cqw / ${geometry.outputAspect})`,
                    }}
                  >
                    <div
                      className="geometry-rotator"
                      style={{
                        width:
                          geometry.rotate === 90 || geometry.rotate === 270
                            ? `${geometry.contentHeight * 100}cqh`
                            : `${geometry.contentWidth * 100}cqw`,
                        height:
                          geometry.rotate === 90 || geometry.rotate === 270
                            ? `${geometry.contentWidth * 100}cqw`
                            : `${geometry.contentHeight * 100}cqh`,
                        transform: geometry.transform,
                        opacity: fadeOpacity,
                      }}
                    >
                      <video
                        key={
                          editor.composition
                            ? (editor.sourceSelection?.id ?? 'loading')
                            : media.asset_id
                        }
                        ref={editor.video}
                        data-monitor-video="source"
                        className="geometry-video"
                        src={editor.sourceUrl}
                        style={{
                          objectViewBox: `inset(${geometry.viewBox.top}% ${geometry.viewBox.right}% ${geometry.viewBox.bottom}% ${geometry.viewBox.left}%)`,
                          filter: color ? `url(#${COLOR_PREVIEW_FILTER_ID})` : undefined,
                        }}
                        onLoadedMetadata={editor.onSourceMetadata}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        muted={editor.processing?.editing?.audio?.muted ?? false}
                        onTimeUpdate={(event) =>
                          editor.onSourceTime(Math.round(event.currentTarget.currentTime * 1000))
                        }
                        onError={() => editor.setError('PREVIEW_UNAVAILABLE')}
                      />
                    </div>
                    {logo && editor.logoUrl && (
                      <img
                        key={editor.logoUrl}
                        data-monitor-logo="true"
                        className="geometry-logo"
                        src={editor.logoUrl}
                        alt=""
                        style={{
                          display: logoBox ? 'block' : 'none',
                          left: `${(logoBox?.x ?? 0) * 100}%`,
                          top: `${(logoBox?.y ?? 0) * 100}%`,
                          width: `${(logoBox?.width ?? 0) * 100}%`,
                          height: `${(logoBox?.height ?? 0) * 100}%`,
                          opacity: logo.opacity,
                        }}
                        onLoad={(event) =>
                          setLogoAspect(
                            event.currentTarget.naturalWidth / event.currentTarget.naturalHeight,
                          )
                        }
                        onError={() => editor.setError('PREVIEW_UNAVAILABLE')}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <video
                  key={
                    editor.composition ? (editor.sourceSelection?.id ?? 'loading') : media.asset_id
                  }
                  ref={editor.video}
                  data-monitor-video="source"
                  src={editor.sourceUrl}
                  style={color ? { filter: `url(#${COLOR_PREVIEW_FILTER_ID})` } : undefined}
                  onLoadedMetadata={editor.onSourceMetadata}
                  muted={editor.processing?.editing?.audio?.muted ?? false}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(event) =>
                    editor.onSourceTime(Math.round(event.currentTarget.currentTime * 1000))
                  }
                  onError={() => editor.setError('PREVIEW_UNAVAILABLE')}
                />
              )
            ) : (
              <EmptyState
                isCompact
                className="video-placeholder"
                title={t(editor.sourceEmpty ? 'sourceEmpty' : 'sourceLoading')}
              />
            )
          ) : preview ? (
            <video
              ref={previewVideo}
              data-monitor-video="preview"
              src={preview.url}
              loop
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(event) =>
                setPreviewClock({ at: 0, of: event.currentTarget.duration * 1000 })
              }
              onTimeUpdate={(event) =>
                setPreviewClock((clock) => ({
                  ...clock,
                  at: event.currentTarget.currentTime * 1000,
                }))
              }
            />
          ) : (
            <EmptyState isCompact className="video-placeholder" title={t('noPreview')} />
          )}
        </div>
      </div>
      {media && (mode === 'source' ? editor.sourceUrl : preview) && (
        <MonitorTransport
          isPlaying={playing}
          at={mode === 'source' ? editor.clock : previewClock.at}
          of={mode === 'source' ? editor.duration : previewClock.of}
          onToggle={() => {
            const video = mode === 'source' ? editor.video.current : previewVideo.current;
            if (!video) return;
            if (video.paused) void video.play();
            else video.pause();
          }}
        />
      )}
      {}
      <VisuallyHidden as="div" role="status">
        {stale ? t('staleHelp') : ''}
      </VisuallyHidden>
      {!media
        ? null
        : mode === 'source'
          ? editor.composition && (
              <Text as="p" type="supporting">
                {t('compositionPreviewHelp')}
              </Text>
            )
          : preview && (
              <div className="preview-controls">
                <div className="monitor-render-actions">
                  <NumberInput
                    label={t('sampleStart')}
                    value={Number(editor.sampleStart)}
                    min={0}
                    step={0.1}
                    width={SAMPLE_RANGE_INPUT_WIDTH}
                    isWheelEnabled={false}
                    isDisabled={editor.opening}
                    onChange={(value) => editor.changeSampleStart(String(value))}
                  />
                  <NumberInput
                    label={t('sampleEnd')}
                    value={Number(editor.sampleEnd)}
                    min={0}
                    step={0.1}
                    width={SAMPLE_RANGE_INPUT_WIDTH}
                    isWheelEnabled={false}
                    isDisabled={editor.opening}
                    onChange={(value) => editor.changeSampleEnd(String(value))}
                  />
                </div>
              </div>
            )}
    </div>
  );
}
