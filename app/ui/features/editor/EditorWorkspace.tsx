import { useResizable } from '@astryxdesign/core/Resizable';
import { percent, pixel } from '@astryxdesign/core/Resizable/utils';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_CLIPS } from '../../../core/editing/composition/document';
import { useNotifications } from '../../shell/NotificationsProvider';
import { processingErrorKey } from '../processing/message-key';
import { EditorRecoveryNotice } from '../projects/recovery/EditorRecoveryNotice';
import { visionErrorKey } from '../vision/error-message';
import { useEditor } from './EditorContext';
import { EditorGeneratorsProvider } from './EditorGeneratorContext';
import {
  EditorRegionHandle,
  EditorSourceRegion,
  EditorToolPanelRegion,
  REGION_DEFAULTS,
} from './EditorRegions';
import { EditorSourcesProvider, type SourceId, useEditorSources } from './EditorSourceContext';
import { EditorSourceRail } from './EditorSourceRail';
import { EditorToolsProvider, useEditorTools } from './EditorToolContext';
import { EditorToolRail } from './EditorToolRail';
import { MediaStage } from './MediaStage';
import { TimelineStrip } from './TimelineStrip';
import { EDITOR_WIDE_BREAKPOINT, useIsWide } from './useIsWide';
import { useMediaAdapters } from './useMediaAdapters';
import { editingErrors } from './video-tools/error-message';

const errorKeys: Record<string, string> = {
  INVALID_TEXT_LAYERS: 'textLayerInvalid',
  TEXT_LAYERS_TOO_LARGE: 'textLayerTooLarge',
  COMPOSITION_CUE_LIMIT: 'compositionCueLimit',
  COMPOSITION_CLIP_LIMIT: 'compositionClipLimit',
  COMPOSITION_DISK_LOW: 'compositionDiskLow',
  INVALID_COMPOSITION: 'compositionInvalid',
  COMPOSITION_UNAUTHORIZED: 'compositionInvalid',
  COMPOSITION_DURATION: 'compositionInvalid',
  COMPOSITION_CLIP_SHORT: 'compositionInvalid',
  COMPOSITION_SAMPLE_SHORT: 'compositionInvalid',
  COMPOSITION_JOIN: 'compositionInvalid',
  COMPOSITION_SPLIT: 'compositionInvalid',
  COMPOSITION_PROCESSING_UNAVAILABLE: 'compositionAiUnavailable',
  ...editingErrors,
  INVALID_SUBTITLE_STYLE: 'styleInvalid',
  INVALID_SOUNDTRACK: 'soundtrackInvalid',
  SOUNDTRACK_UNAUTHORIZED: 'soundtrackInvalid',
  NO_AUDIO: 'soundtrackInvalid',
  STALE_OPERATION: 'libraryStaleOpen',
  EDITOR_BUSY: 'libraryBusy',
  INVALID_PROJECT: 'projectError',
  PROJECT_TOO_LARGE: 'projectError',
  PROJECT_EXTENSION: 'projectError',
  COMPONENT_MISSING: 'componentError',
  INVALID_CUES: 'timingError',
  SPLIT_RANGE: 'splitError',
  SOURCE_CHANGED: 'sourceChanged',
  SOURCE_MISSING: 'sourceChanged',
  PREVIEW_UNAVAILABLE: 'previewError',
  CANCELLED: 'cancelled',
  UNSUPPORTED_VIDEO_FORMAT: 'unsupportedVideoFormat',
};

const TIMELINE_DEFAULT_HEIGHT = 220;

export function EditorWorkspace() {
  // The rail, the tool panel and the cue list's reviews share one selection
  // and one set of recognition/translation jobs, so the providers sit around
  // the whole frame: a run started in a tool panel is the same job whose draft
  // the cue column reviews.
  return (
    <EditorToolsProvider>
      <EditorSourcesProvider>
        <EditorGeneratorsProvider>
          <EditorStudio />
        </EditorGeneratorsProvider>
      </EditorSourcesProvider>
    </EditorToolsProvider>
  );
}

function EditorStudio() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { activeTool, collapseTool } = useEditorTools();
  const { activeSource, selectSource, collapseSource } = useEditorSources();
  // The rail item a seam drag re-opens: the last one the user had open.
  const lastSource = useRef<SourceId>(activeSource ?? 'cues');
  if (activeSource) lastSource.current = activeSource;
  const { media, cap, error } = editor;
  const wave = useMediaAdapters();
  const isWide = useIsWide(EDITOR_WIDE_BREAKPOINT);
  const studioBodyRef = useRef<HTMLDivElement>(null);
  const toolPanelOpen = activeTool != null;
  const { raiseError } = useNotifications();

  // A failed operation is what just happened, not a standing condition, so it
  // is raised on the application's one toast surface instead of pushing the
  // regions down with a banner (owner). The error code stays out of
  // the message — it belongs in the Diagnostic log, not in user copy.
  useEffect(() => {
    if (!error) return;
    raiseError(
      t(
        processingErrorKey(error) ||
          errorKeys[error] ||
          (error.startsWith('MODEL_') || error.startsWith('VISION_')
            ? visionErrorKey(error)
            : 'failed'),
        // The clip limit reads its own count from the one constant, so the
        // copy never restates a number the composition owns (ticket 05 review).
        { count: MAX_CLIPS },
      ),
      error,
    );
  }, [error, raiseError, t]);

  // Three resizable seams (source panel↔viewer, viewer↔tool panel,
  // top↔timeline), persisted per user via useResizable's own localStorage
  // (`autoSaveId`), keyboard-accessible through ResizeHandle, reset on a
  // seam double-click. The video region never takes an explicit size — it
  // is whatever the flex row leaves over, so it is always the largest.
  //
  // Both side regions run useResizable's *controlled* collapse: the rail
  // selection is the one truth for whether a column is open, so dragging a
  // seam past the collapse threshold reports through `onCollapseChange` and
  // closes the panel to its rail exactly as clicking the open rail item does
  // (owner — before this, a seam could not reach the rail at all).
  const sourceRegion = useResizable({
    direction: 'horizontal',
    containerRef: studioBodyRef,
    autoSaveId: 'editor.regions.sourceWidth',
    defaultSize: REGION_DEFAULTS.source,
    // Below this, CuePanel's own search field and stacked layer/language
    // selectors (see editor.css `.cue-panel-*`) no longer hold their full
    // label — useResizable clamps a drag at minSize rather than letting it
    // settle anywhere lower, so this is the true floor; a further drag past
    // collapsedSize snaps straight to the rail instead of resting in between.
    // maxSize is a live 28% of the studio body's own measured width, not a
    // flat 480px: at 1420 wide that flat cap left the viewer with as little
    // as ~250px once both side regions were dragged to it. 28%+28% stays
    // comfortably under the two-thirds a symmetric drag-both-to-max needs to
    // leave the viewer the largest of the three at any working width.
    minSize: 260,
    maxSize: percent(28, { min: pixel(360) }),
    collapsible: true,
    collapsedSize: 44,
    isCollapsed: activeSource == null,
    onCollapseChange: (collapsed) => {
      if (collapsed) collapseSource();
      else selectSource(lastSource.current);
    },
  });
  const toolPanelRegion = useResizable({
    direction: 'horizontal',
    containerRef: studioBodyRef,
    autoSaveId: 'editor.regions.toolPanelWidth',
    defaultSize: REGION_DEFAULTS.toolPanel,
    minSize: 280,
    maxSize: percent(28, { min: pixel(360) }),
    collapsible: true,
    collapsedSize: 44,
    isCollapsed: activeTool == null,
    onCollapseChange: (collapsed) => {
      if (collapsed) collapseTool();
    },
  });
  const timelineRegion = useResizable({
    direction: 'vertical',
    autoSaveId: 'editor.regions.timelineHeight',
    defaultSize: TIMELINE_DEFAULT_HEIGHT,
    minSize: 140,
    maxSize: 480,
    collapsible: false,
  });

  // Owner requirement: no separate start screen or card. The
  // full region frame — cue list, viewer, tool panel, tool rail, timeline —
  // renders at its normal default proportions whether or not a video is open,
  // so opening one never reflows the layout; each region shows its own
  // disabled/empty content instead.
  return (
    <div className="editor-workspace">
      <div className="editor-feedback">
        {cap && !cap.pysubs2 && <div className="warning">{t('missing')}</div>}
        {media && (
          <VisuallyHidden as="div" role="status">
            {editor.dirty ? t('projectUnsaved') : t('projectClean')}
          </VisuallyHidden>
        )}
        <EditorRecoveryNotice />
      </div>
      <div className="editor-studio-body" ref={studioBodyRef}>
        <EditorSourceRail />
        <EditorSourceRegion region={sourceRegion} />
        {/* The seam only exists while the column is open; the rail is what
            re-opens it once a drag has closed it. */}
        {activeSource && (
          <EditorRegionHandle
            region={sourceRegion}
            direction="horizontal"
            label={t('resizeCueHandle')}
            defaultSize={REGION_DEFAULTS.source}
          />
        )}
        <section className="editor-viewer-region" aria-label={t('mainStageLabel')}>
          <MediaStage isWide={isWide} />
        </section>
        {/* Always rendered so the panel that follows keeps a fixed tree slot
            and never remounts when the panel opens or the window crosses the
            breakpoint; `hidden` removes it from layout and tab order whenever
            the panel is closed or the layout is the overlay drawer. */}
        <div className="editor-tool-panel-handle" hidden={!isWide || !toolPanelOpen}>
          <EditorRegionHandle
            region={toolPanelRegion}
            direction="horizontal"
            isReversed
            label={t('resizeToolPanelHandle')}
            defaultSize={REGION_DEFAULTS.toolPanel}
          />
        </div>
        {toolPanelOpen && (
          <EditorToolPanelRegion region={toolPanelRegion} isWide={isWide} onClose={collapseTool} />
        )}
        <EditorToolRail />
      </div>
      <EditorRegionHandle
        region={timelineRegion}
        direction="vertical"
        isReversed
        label={t('resizeTimelineHandle')}
        defaultSize={TIMELINE_DEFAULT_HEIGHT}
      />
      <div className="editor-timeline-region" style={{ height: timelineRegion.size }}>
        <TimelineStrip wave={wave} />
      </div>
    </div>
  );
}
