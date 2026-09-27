import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { StackItem } from '@astryxdesign/core/Stack';
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
import type { CoverBand } from '../../../core/subtitles/style';
import { unwrap } from '../../bridge/client';
import { useEditor } from './EditorContext';
import { useEditorTools } from './EditorToolContext';
import { useLiveMix } from './live-mix/useLiveMix';
import { CoverBandOverlay } from './subtitle-styles/CoverBandOverlay';
import { useSubtitleOverlay } from './useMediaAdapters';

// Mirrors the worker's FFmpeg `eq` on the live source.
const COLOR_PREVIEW_FILTER_ID = 'editor-color-preview';

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
    <HStack gap={2} vAlign="center">
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
    </HStack>
  );
}

function clockText(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

export function MediaStage() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { activeTool } = useEditorTools();
  const { media, revision, ass } = editor;
  const { color, crop, flip, rotate, fade, logo, output } = editor.processing?.editing ?? {};
  const cover = editor.processing?.subtitle_style?.cover ?? null;
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
    (cover !== null ||
      rotate !== undefined ||
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
    if (!fade || !media) return 1;
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
  const resultVideo = useRef<HTMLVideoElement>(null);
  const subtitleCanvas = useRef<HTMLCanvasElement>(null);
  useSubtitleOverlay(subtitleCanvas);
  const [resultClock, setResultClock] = useState(0);
  const [resultDuration, setResultDuration] = useState(0);
  const result = editor.preview && editor.preview.revision === revision ? editor.preview : null;
  // The live mix reads the output clock: a composition's clock, otherwise the element's time.
  const clockRef = useRef(0);
  clockRef.current = editor.clock;
  // The live program monitor mixes the voice track, music and ducking while the source plays.
  const liveMix = useLiveMix({
    video: editor.video,
    media,
    composition: editor.composition,
    soundtrack: editor.soundtrack,
    voiceTrack: editor.voiceTrack,
    editing: editor.processing?.editing,
    clockMs: () => clockRef.current,
    clipId: editor.sourceSelection?.id ?? media?.asset_id,
    enabled: !result,
  });
  useEffect(() => {
    if (liveMix.error) editor.setError(liveMix.error);
  }, [liveMix.error, editor.setError]);

  function changeCoverBand(band: CoverBand) {
    const style = editor.processing?.subtitle_style;
    if (!style) return;
    editor.changeProcessing({
      ...(editor.processing ?? {}),
      subtitle_style: { ...style, cover: band },
    });
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

  const stale = media != null && !editor.composition && ass?.revision !== revision;

  return (
    <div className="viewers">
      <HStack
        gap={3}
        vAlign="center"
        wrap="wrap"
        hAlign="between"
        minHeight="var(--spacing-10)"
        paddingBlock={2}
        className="monitor-header"
      >
        <StackItem size="fill">
          <VisuallyHidden as="h5">{t('monitorTitle')}</VisuallyHidden>
        </StackItem>
        {stale && (
          <StackItem className="monitor-header-badge">
            <Tooltip content={t('staleHelp')}>
              <Badge variant="warning" label={t('stale')} />
            </Tooltip>
          </StackItem>
        )}
      </HStack>
      {editor.sourceSelection && (
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
          {result ? (
            <video
              ref={resultVideo}
              data-monitor-video="result"
              crossOrigin="anonymous"
              src={result.url}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(event) => setResultDuration(event.currentTarget.duration * 1000)}
              onTimeUpdate={(event) => setResultClock(event.currentTarget.currentTime * 1000)}
            />
          ) : !media ? (
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
          ) : editor.sourceUrl ? (
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
                      crossOrigin="anonymous"
                      className="geometry-video"
                      src={editor.sourceUrl}
                      style={{
                        objectViewBox: `inset(${geometry.viewBox.top}% ${geometry.viewBox.right}% ${geometry.viewBox.bottom}% ${geometry.viewBox.left}%)`,
                        filter: color ? `url(#${COLOR_PREVIEW_FILTER_ID})` : undefined,
                      }}
                      onLoadedMetadata={editor.onSourceMetadata}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      muted={
                        liveMix.active ? false : (editor.processing?.editing?.audio?.muted ?? false)
                      }
                      onTimeUpdate={(event) =>
                        editor.onSourceTime(Math.round(event.currentTarget.currentTime * 1000))
                      }
                      onEnded={editor.onSourceEnded}
                      onError={() => editor.setError('PREVIEW_UNAVAILABLE')}
                    />
                    {cover && (
                      <CoverBandOverlay
                        band={cover}
                        disabled={activeTool !== 'style' || editor.opening || editor.busy}
                        onChange={changeCoverBand}
                      />
                    )}
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
                  <canvas ref={subtitleCanvas} className="JASSUB subtitle-overlay" />
                </div>
              </div>
            ) : (
              <div
                className="source-frame"
                style={{
                  width: `min(100cqw, 100cqh * ${media.width / media.height})`,
                  height: `min(100cqh, 100cqw / ${media.width / media.height})`,
                }}
              >
                <video
                  key={
                    editor.composition ? (editor.sourceSelection?.id ?? 'loading') : media.asset_id
                  }
                  ref={editor.video}
                  data-monitor-video="source"
                  crossOrigin="anonymous"
                  src={editor.sourceUrl}
                  style={color ? { filter: `url(#${COLOR_PREVIEW_FILTER_ID})` } : undefined}
                  onLoadedMetadata={editor.onSourceMetadata}
                  muted={
                    liveMix.active ? false : (editor.processing?.editing?.audio?.muted ?? false)
                  }
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(event) =>
                    editor.onSourceTime(Math.round(event.currentTarget.currentTime * 1000))
                  }
                  onEnded={editor.onSourceEnded}
                  onError={() => editor.setError('PREVIEW_UNAVAILABLE')}
                />
                <canvas ref={subtitleCanvas} className="JASSUB subtitle-overlay" />
              </div>
            )
          ) : (
            <EmptyState
              isCompact
              className="video-placeholder"
              title={t(editor.sourceEmpty ? 'sourceEmpty' : 'sourceLoading')}
            />
          )}
        </div>
      </div>
      {result || (media && editor.sourceUrl) ? (
        <MonitorTransport
          isPlaying={playing}
          at={result ? resultClock : editor.clock}
          of={result ? resultDuration : editor.duration}
          onToggle={() => {
            const video = result ? resultVideo.current : editor.video.current;
            if (!video) return;
            if (video.paused) void video.play();
            else video.pause();
          }}
        />
      ) : null}
      {result && (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button
            label={t('resultOpen')}
            size="sm"
            onClick={() =>
              void unwrap(window.reupmatic.outputOpen(result.artifact_id)).catch((reason) =>
                editor.report(reason),
              )
            }
          />
          <Button
            label={t('resultShowInFolder')}
            size="sm"
            onClick={() =>
              void unwrap(window.reupmatic.outputReveal(result.artifact_id)).catch((reason) =>
                editor.report(reason),
              )
            }
          />
          <Button
            label={t('resultPost')}
            size="sm"
            variant="primary"
            isDisabled={!editor.media?.library_id}
            onClick={() => void editor.postExport(result.artifact_id)}
          />
          {!editor.media?.library_id && (
            <Text as="span" type="supporting">
              {t('postRequiresLibrary')}
            </Text>
          )}
        </HStack>
      )}
      <VisuallyHidden as="div" role="status">
        {stale ? t('staleHelp') : ''}
      </VisuallyHidden>
    </div>
  );
}
