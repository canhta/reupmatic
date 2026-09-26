import { Banner } from '@astryxdesign/core/Banner';
import { useResizable } from '@astryxdesign/core/Resizable';
import { percent, pixel } from '@astryxdesign/core/Resizable/utils';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { VStack } from '@astryxdesign/core/VStack';
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
  const lastSource = useRef<SourceId>(activeSource ?? 'cues');
  if (activeSource) lastSource.current = activeSource;
  const { media, cap, error } = editor;
  const wave = useMediaAdapters();
  const isWide = useIsWide(EDITOR_WIDE_BREAKPOINT);
  const studioBodyRef = useRef<HTMLDivElement>(null);
  const toolPanelOpen = activeTool != null;
  const { raiseError } = useNotifications();

  useEffect(() => {
    if (!error) return;
    raiseError(
      t(
        processingErrorKey(error) ||
          errorKeys[error] ||
          (error.startsWith('MODEL_') || error.startsWith('VISION_')
            ? visionErrorKey(error)
            : 'failed'),
        { count: MAX_CLIPS },
      ),
      error,
    );
  }, [error, raiseError, t]);

  const sourceRegion = useResizable({
    direction: 'horizontal',
    containerRef: studioBodyRef,
    autoSaveId: 'editor.regions.sourceWidth',
    defaultSize: REGION_DEFAULTS.source,
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

  return (
    <div className="editor-workspace">
      <VStack gap={3}>
        {cap && !cap.pysubs2 && <Banner status="warning" title={t('missing')} />}
        {media && (
          <VisuallyHidden as="div" role="status">
            {editor.dirty ? t('projectUnsaved') : t('projectClean')}
          </VisuallyHidden>
        )}
        <EditorRecoveryNotice />
      </VStack>
      <div className="editor-studio-body" ref={studioBodyRef}>
        <EditorSourceRail />
        <EditorSourceRegion region={sourceRegion} />
        {}
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
        {}
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
