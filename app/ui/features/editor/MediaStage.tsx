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

// Sample-range inputs sit beside the monitor's own Render sample action, so
// they stay narrow rather than a full-width form row.
const SAMPLE_RANGE_INPUT_WIDTH = 112;

// One inline SVG filter mirrors the worker's FFmpeg `eq`; Source mode points
// its `<video>` at it so the live view agrees with the rendered sample. It is
// applied to Source only — a rendered sample already has `eq` baked in.
const COLOR_PREVIEW_FILTER_ID = 'editor-color-preview';

type MonitorMode = 'source' | 'preview';

/**
 * The monitor's transport (owner): a studio player names its own
 * position and owns its own play control — the browser's default `controls`
 * chrome belongs to a web page, not to a desktop monitor, and it never matched
 * a framed source (it rotates with the picture). Scrubbing stays with the
 * timeline below, which is the Editor's one time ruler.
 */
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

/** m:ss, the timeline's own reading of a position. */
function clockText(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

/**
 * The preview/monitor region: one video frame, matching standard NLE
 * convention (always present, never a blank void), with a Source/Rendered
 * preview mode switch — not two stacked video cards. Each mode shows only
 * the controls that belong to it (owner decision, see EditorContext for the
 * shared render-eligibility fields both modes and the render band use).
 */
export function MediaStage({ isWide }: { isWide: boolean }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const { media, preview, revision, ass, documentId } = editor;
  const { color, crop, flip, rotate, fade, logo, output } = editor.processing?.editing ?? {};
  const [mode, setMode] = useState<MonitorMode>('source');
  // The logo preview needs the image's own ratio; the monitor reads it off the
  // loaded image, so a re-loaded URL re-measures on its own load event.
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
  // Only re-lay the monitor when the framing actually changes the frame; an
  // identity recipe keeps the plain player exactly as it was.
  const staged =
    geometry != null &&
    (rotate !== undefined ||
      flip !== undefined ||
      crop !== undefined ||
      fade !== undefined ||
      logo !== undefined ||
      Math.abs(geometry.outputAspect - geometry.contentAspect) > 1e-9);
  // The same box the worker's `overlay` draws, over the monitor's output frame.
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
  // "Adjusting state during rendering" (react.dev), not an Effect: a
  // different document (new open, recovered draft, reopened project) starts
  // back at Source; otherwise, a freshly finished sample/full render
  // switches to Rendered preview. Editing cues or styles afterwards marks
  // the result stale (below) but must not switch the monitor back on its
  // own — both branches only ever fire once per real change, comparing
  // against what was rendered last time.
  const [seenDocumentId, setSeenDocumentId] = useState(documentId);
  if (documentId !== seenDocumentId) {
    setSeenDocumentId(documentId);
    setMode('source');
    lastPreviewId.current = null;
  } else if (preview && preview.artifact_id !== lastPreviewId.current) {
    lastPreviewId.current = preview.artifact_id;
    setMode('preview');
  }

  // A disabled busy button is blurred to <body>; a cancelled open must not strand focus there.
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

  // Coordinator review: "Out of date — settings changed" used to
  // float in its own line below the video card in both modes. It is the one
  // status this region ever needs to interrupt for (badges are for
  // exceptions, not normal state), so it moves into the header row
  // as a Badge instead of a floating notice under the frame. `media != null`
  // guards both: with nothing open yet, `ass` is still `null` and `preview`
  // still unset, so the revision comparison alone would call that "stale"
  // (there's nothing to be stale relative to) — the original below-the-tray
  // text carried the same guard via its outer `!media ? null : …`.
  const sourceStale = media != null && !editor.composition && ass?.revision !== revision;
  const previewStale =
    media != null && mode === 'preview' && preview != null && preview.revision !== revision;
  const stale = mode === 'source' ? sourceStale : previewStale;

  // Owner requirement: no separate centered start card — the
  // empty Editor renders the full region frame (this viewer included) at
  // its normal proportions, so opening a video never reflows the layout.
  // The monitor keeps its own header/chrome; only the frame inside becomes
  // a hint-plus-drop-target instead of a `<video>`.
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
                // The sandboxed preload's own hook (not a wire operation — see preload.cts)
                // resolves the dropped `File` to a real filesystem path; openPath then validates
                // and registers it exactly like the open dialog's picked path does.
                const path = window.reupmatic.getPathForFile(file);
                if (path) void editor.openPath(path);
              }}
            >
              <EmptyState isCompact className="video-placeholder" title={t('openHint')} />
            </div>
          ) : mode === 'source' ? (
            editor.sourceUrl ? (
              staged && geometry ? (
                // The Source monitor previews the export frame: a black output
                // frame holds a rotator that applies rotate/flip, and
                // object-view-box selects the crop in the source frame. The
                // numbers come from geometryPreview, the same recipe the worker
                // filter chain consumes (app/core/editing/geometry-preview.ts).
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
            // No separate "render sample" action here: the header's Render
            // sample button (above) is this command's one home.
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
      {/* Its own live region, mirroring EditorWorkspace's dirty/clean
          announcement pattern: the Badge above is visual-only, so a screen
          reader needs a separate role="status" text to hear staleness
          change without repeating on every unrelated re-render. */}
      <VisuallyHidden as="div" role="status">
        {stale ? t('staleHelp') : ''}
      </VisuallyHidden>
      {!media
        ? null
        : mode === 'source'
          ? // Only render a line when it carries a real consequence: the
            // header Badge above already covers staleness (UI-CP07 — normal,
            // up-to-date source playback needs no standing hint now that the
            // Source/Rendered switch and header Render sample button already
            // show what preview mode is active).
            editor.composition && (
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
