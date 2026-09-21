import { ContextMenu } from '@astryxdesign/core/ContextMenu';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Stack } from '@astryxdesign/core/Stack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Timeline } from '@xzdarcy/react-timeline-editor';
// react-timeline-editor ships its own stylesheet separately from the
// component; without it, every track row, action block and the playhead
// render with no background/border/color at all (browser defaults only) —
// the region has real height but nothing in it is visible. This is the app's
// only consumer of this library, so the import is colocated here rather
// than in a shared stylesheet.
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { Eye, EyeOff, Scissors, Trash2, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { compositionSpans } from '../../../core/editing/composition/document';
import {
  getTextLayer,
  type TextLayerName,
  textLayerNames,
} from '../../../core/subtitles/layers/document';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { useEditor } from './EditorContext';
import { MEDIA_DRAG_TYPE } from './media-drag';

// react-timeline-editor takes its row height as a raw inline style, not a CSS
// custom property, so every lane is sized explicitly: the clips lane fits a
// clip name, audio lanes are compact, and the subtitles lane holds its layer
// name and eyes. `RULER_HEIGHT` is the library's 32px time area plus its 10px
// edit-area margin — the lane headers offset by it so every header lines up
// with its row.
const LANE_ROW_HEIGHT = 24;
const RULER_HEIGHT = 42;
const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const BASE_SCALE_WIDTH = 120;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable === true
  );
}

export function TimelineStrip({ wave }: { wave: (node: HTMLDivElement | null) => void }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const confirm = useConfirmation();
  const {
    activeTextLayer,
    media,
    composition,
    primaryClip,
    duration,
    timeline,
    changeLayerCues: change,
    seek,
    setSelected,
    processing,
    soundtrack,
    voiceTrack,
    textSnapshot,
  } = editor;
  // The clips lane always shows the placed clips; before any composition exists
  // the project's own video is its one implicit clip, so every reference
  // editor's "video track" is present from the moment a project opens (ticket
  // 05 review). It carries no Disable/split/delete affordance of its own until
  // it becomes a real composition.
  const spans = useMemo(() => {
    if (composition) return compositionSpans(composition);
    if (!media || !primaryClip) return [];
    return [{ clip: primaryClip, start_ms: 0, end_ms: duration }];
  }, [composition, media, primaryClip, duration]);
  const spokenCues = useMemo(() => getTextLayer(textSnapshot, 'spoken').cues, [textSnapshot]);
  const bandRef = useRef<HTMLDivElement>(null);
  const [bandWidth, setBandWidth] = useState(0);
  const [drop, setDrop] = useState<{ index: number; x: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedClip, setSelectedClip] = useState('');
  const enabledClips = useMemo(
    () => new Set((composition?.clips ?? []).filter((clip) => clip.enabled).map((clip) => clip.id)),
    [composition],
  );
  function toggleClip(id: string, enabled: boolean) {
    try {
      editor.applyComposition([{ kind: 'enable', id, enabled }], editor.getRevision());
    } catch (reason) {
      editor.report(reason);
    }
  }
  function splitClip(id: string, at_ms: number) {
    try {
      editor.applyComposition(
        [{ kind: 'split', id, at_ms, new_id: crypto.randomUUID() }],
        editor.getRevision(),
      );
    } catch (reason) {
      editor.report(reason);
    }
  }
  async function deleteClip(id: string) {
    if (!(await confirm(t('compositionRemoveConfirm')))) return;
    try {
      editor.applyComposition([{ kind: 'remove', id }], editor.getRevision());
    } catch (reason) {
      editor.report(reason);
    }
  }
  // Dragging a Project media row onto the band inserts it at the drop position
  // (ticket 05). The clips lane is the first editor row; each clip block's own
  // box gives the boundary, so the index follows the rendered timeline rather
  // than a fixed pixel assumption. Before any composition the single primary
  // clip's box is that boundary, so a drop before or after it builds the
  // composition on the chosen side.
  function clipActionRects(): DOMRect[] {
    const clipsRow = bandRef.current?.querySelector('.timeline-editor-edit-row');
    if (!clipsRow) return [];
    return Array.from(clipsRow.querySelectorAll('.timeline-editor-action')).map((node) =>
      node.getBoundingClientRect(),
    );
  }
  function dropIndexAt(clientX: number): number {
    let index = 0;
    for (const rect of clipActionRects()) {
      if (clientX >= rect.left + rect.width / 2) index += 1;
    }
    return index;
  }
  function dropLineX(index: number): number {
    const band = bandRef.current?.getBoundingClientRect();
    const rects = clipActionRects();
    if (!band || !rects.length) return 0;
    if (index <= 0) return rects[0].left - band.left;
    if (index >= rects.length) return rects[rects.length - 1].right - band.left;
    return rects[index].left - band.left;
  }
  function onMediaDragOver(event: DragEvent<HTMLDivElement>) {
    // The clips lane exists whenever a project is open (the primary video is a
    // clip), so a Project media video can be dropped before or after it.
    if (!media || !event.dataTransfer?.types.includes(MEDIA_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const index = dropIndexAt(event.clientX);
    setDrop({ index, x: dropLineX(index) });
  }
  function onMediaDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDrop(null);
  }
  function onMediaDrop(event: DragEvent<HTMLDivElement>) {
    if (!media || !event.dataTransfer?.types.includes(MEDIA_DRAG_TYPE)) return;
    event.preventDefault();
    const id = event.dataTransfer.getData(MEDIA_DRAG_TYPE);
    const item = editor.projectMedia.find((entry) => entry.id === id);
    const index = dropIndexAt(event.clientX);
    setDrop(null);
    if (item) void editor.placeMedia(item, index);
  }
  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setBandWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey) {
        if (event.key === '=' || event.key === '+') {
          event.preventDefault();
          setZoom((z) => clampZoom(z + ZOOM_STEP));
        } else if (event.key === '-') {
          event.preventDefault();
          setZoom((z) => clampZoom(z - ZOOM_STEP));
        }
        return;
      }
      // Final Cut Pro's clip disable key: V toggles the selected clip. Ignore
      // it while typing or with a modifier so it never eats cue text.
      if (
        event.key.toLowerCase() === 'v' &&
        !event.altKey &&
        !event.shiftKey &&
        !isTypingTarget(event.target) &&
        selectedClip
      ) {
        event.preventDefault();
        toggleClip(selectedClip, !enabledClips.has(selectedClip));
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });
  const originalMuted = processing?.editing?.audio?.muted ?? false;
  function toggleOriginalMuted(muted: boolean) {
    const editing = processing?.editing;
    editor.changeProcessing({
      ...processing,
      editing: {
        ...editing,
        audio: { muted, gain_db: editing?.audio?.gain_db ?? 0 },
      },
    });
  }
  const voiceLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const [index, line] of (voiceTrack?.plan.lines ?? []).entries()) {
      labels.set(
        `voice:${line.cue_id}:${index}`,
        spokenCues.find((cue) => cue.id === line.cue_id)?.text ?? t('laneVoice'),
      );
    }
    return labels;
  }, [voiceTrack, spokenCues, t]);
  const laneLayout = useMemo(() => {
    const list: { id: string; height: number }[] = [];
    // The clips lane is present whenever a project is open: the primary video is
    // its first clip even before a composition exists (ticket 05 review).
    if (media) list.push({ id: 'clips', height: LANE_ROW_HEIGHT });
    if (media) list.push({ id: 'original', height: LANE_ROW_HEIGHT });
    if (voiceTrack) list.push({ id: 'voice', height: LANE_ROW_HEIGHT });
    if (soundtrack) list.push({ id: 'music', height: LANE_ROW_HEIGHT });
    // One lane per text layer that actually holds cues; an empty layer has nothing to burn.
    for (const name of textLayerNames)
      if (getTextLayer(textSnapshot, name).cues.length)
        list.push({ id: `subtitles:${name}`, height: LANE_ROW_HEIGHT });
    return list;
  }, [media, voiceTrack, soundtrack, textSnapshot]);
  function renderLaneHeader(id: string): ReactNode {
    if (id === 'clips')
      // Same `supporting` scale as every other lane header: `label` read one
      // step larger than Original/Voice/Music/text layers beside it.
      return (
        <Text as="span" type="supporting" className="timeline-lane-name">
          {t('laneClips')}
        </Text>
      );
    if (id.startsWith('subtitles:')) {
      const name = id.slice('subtitles:'.length) as TextLayerName;
      const burned = editor.visibleLayer === name;
      return (
        <Stack direction="horizontal" gap={1} align="center" className="timeline-lane-subtitles">
          <ToggleButton
            label={
              burned
                ? t('layerHide', { layer: t(`textLayer_${name}`) })
                : t('layerShow', { layer: t(`textLayer_${name}`) })
            }
            tooltip={t(`textLayer_${name}`)}
            isIconOnly
            size="sm"
            isPressed={burned}
            icon={<Icon icon={EyeOff} size="sm" />}
            pressedIcon={<Icon icon={Eye} size="sm" />}
            onPressedChange={(pressed) => editor.changeLayerVisibility(name, pressed)}
          />
          <Text as="span" type="supporting" className="timeline-lane-name">
            {t(`textLayer_${name}`)}
          </Text>
          {burned && (
            // `neutral`, matching the Project media used marker: accent is
            // reserved for selection/progress/focus/the one primary action
            // (UI-CL02), never a state marker. The label carries the meaning.
            <StatusDot variant="neutral" label={t('layerBurnedIn')} tooltip={t('layerBurnedIn')} />
          )}
        </Stack>
      );
    }
    const muted =
      id === 'original'
        ? originalMuted
        : id === 'voice'
          ? Boolean(voiceTrack?.muted)
          : Boolean(soundtrack?.muted);
    const label =
      id === 'original' ? t('laneOriginal') : id === 'voice' ? t('laneVoice') : t('laneMusic');
    const muteLabel = (isMuted: boolean): string => {
      if (id === 'original') return isMuted ? t('laneUnmuteOriginal') : t('laneMuteOriginal');
      if (id === 'voice') return isMuted ? t('laneUnmuteVoice') : t('laneMuteVoice');
      return isMuted ? t('laneUnmuteMusic') : t('laneMuteMusic');
    };
    const onMute = (pressed: boolean) => {
      if (id === 'original') toggleOriginalMuted(pressed);
      else if (id === 'voice' && voiceTrack)
        editor.changeVoiceTrack({ ...voiceTrack, muted: pressed });
      else if (id === 'music' && soundtrack)
        editor.changeSoundtrack({ ...soundtrack, muted: pressed });
    };
    return (
      <Stack direction="horizontal" gap={1} align="center">
        <Text as="span" type="supporting" className="timeline-lane-name">
          {label}
        </Text>
        <ToggleButton
          label={muteLabel(muted)}
          tooltip={muteLabel(muted)}
          isIconOnly
          size="sm"
          isPressed={muted}
          icon={<Icon icon={Volume2} size="sm" />}
          pressedIcon={<Icon icon={VolumeX} size="sm" />}
          onPressedChange={onMute}
        />
      </Stack>
    );
  }
  const rows = useMemo(
    () =>
      laneLayout.map((lane) => {
        const actions =
          lane.id === 'clips'
            ? spans.map((span) => ({
                id: `clip:${span.clip.id}`,
                start: span.start_ms / 1000,
                end: span.end_ms / 1000,
                effectId: 'clip',
                flexible: false,
                movable: false,
              }))
            : lane.id === 'original'
              ? [
                  {
                    id: 'original',
                    start: 0,
                    end: duration / 1000,
                    effectId: 'original',
                    flexible: false,
                    movable: false,
                  },
                ]
              : lane.id === 'voice'
                ? (voiceTrack?.plan.lines ?? []).map((line, index) => ({
                    id: `voice:${line.cue_id}:${index}`,
                    start: line.offset_ms / 1000,
                    end: (line.offset_ms + Math.max(1, line.slot_ms)) / 1000,
                    effectId: 'voice',
                    flexible: false,
                    movable: false,
                  }))
                : lane.id === 'music'
                  ? [
                      {
                        id: 'music',
                        start: (soundtrack?.offset_ms ?? 0) / 1000,
                        end:
                          ((soundtrack?.offset_ms ?? 0) +
                            ((soundtrack?.end_ms ?? 0) - (soundtrack?.start_ms ?? 0))) /
                          1000,
                        effectId: 'music',
                        flexible: false,
                        movable: false,
                      },
                    ]
                  : lane.id.startsWith('subtitles:')
                    ? getTextLayer(
                        textSnapshot,
                        lane.id.slice('subtitles:'.length) as TextLayerName,
                      ).cues.map((cue) => ({
                        id: cue.id,
                        start: cue.start_ms / 1000,
                        end: cue.end_ms / 1000,
                        effectId: 'subtitle',
                        minStart: 0,
                        maxEnd: duration / 1000,
                      }))
                    : [];
        return { id: lane.id, actions };
      }),
    [laneLayout, spans, duration, voiceTrack, soundtrack, textSnapshot],
  );
  // Default zoom (1×) fits the whole duration to the measured band width —
  // `scaleWidth` is derived, not the fixed 120px every duration used to get
  // regardless of how much of the band it actually filled.
  const scaleCount = Math.max(4, Math.ceil(duration / 5000));
  const fitScaleWidth = bandWidth > 0 ? bandWidth / scaleCount : BASE_SCALE_WIDTH;
  const scaleWidth = Math.max(32, fitScaleWidth * zoom);
  const bandHeight = RULER_HEIGHT + laneLayout.reduce((sum, lane) => sum + lane.height, 0);
  return (
    <section className="timeline">
      <div className="timeline-lanes">
        <div className="timeline-lane-headers">
          <div className="timeline-lane-tools" style={{ height: RULER_HEIGHT }}>
            <IconButton
              label={t('timelineZoomOut')}
              tooltip={t('timelineZoomOut')}
              size="sm"
              variant="ghost"
              isDisabled={!media || zoom <= ZOOM_MIN}
              icon={<Icon icon={ZoomOut} size="sm" />}
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            />
            <IconButton
              label={t('timelineZoomIn')}
              tooltip={t('timelineZoomIn')}
              size="sm"
              variant="ghost"
              isDisabled={!media || zoom >= ZOOM_MAX}
              icon={<Icon icon={ZoomIn} size="sm" />}
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            />
          </div>
          {laneLayout.map((lane) => (
            <div key={lane.id} className="timeline-lane-header" style={{ height: lane.height }}>
              {renderLaneHeader(lane.id)}
            </div>
          ))}
        </div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a Project media drag target, not a click/keyboard control — "Add to timeline" in the row's menu is the keyboard path; this only adds the pointer/drag placement path. */}
        <div
          ref={bandRef}
          className={`timeline-band${drop ? ' timeline-band--drop' : ''}`}
          onDragOver={onMediaDragOver}
          onDragLeave={onMediaDragLeave}
          onDrop={onMediaDrop}
        >
          {drop && (
            <div className="timeline-drop-line" style={{ left: drop.x }} aria-hidden="true" />
          )}
          <Timeline
            ref={timeline}
            editorData={rows}
            effects={{
              subtitle: { id: 'subtitle', name: t(`textLayer_${activeTextLayer}`) },
              clip: { id: 'clip', name: t('compositionTitle') },
              original: { id: 'original', name: t('laneOriginal') },
              voice: { id: 'voice', name: t('laneVoice') },
              music: { id: 'music', name: t('laneMusic') },
            }}
            scale={5}
            scaleWidth={scaleWidth}
            rowHeight={LANE_ROW_HEIGHT}
            minScaleCount={scaleCount}
            maxScaleCount={scaleCount}
            style={{ width: '100%', height: bandHeight }}
            onChange={(data) => {
              for (const row of data) {
                if (!row.id.startsWith('subtitles:')) continue;
                const name = row.id.slice('subtitles:'.length) as TextLayerName;
                const positions = new Map(
                  row.actions.map((action) => [action.id, action] as const),
                );
                change(
                  getTextLayer(textSnapshot, name).cues.map((cue) => {
                    const action = positions.get(cue.id);
                    return action
                      ? {
                          ...cue,
                          start_ms: Math.round(action.start * 1000),
                          end_ms: Math.round(action.end * 1000),
                        }
                      : cue;
                  }),
                  name,
                );
              }
            }}
            onClickAction={(_event, { action }) => {
              if (action.effectId === 'clip') setSelectedClip(action.id.slice('clip:'.length));
              else if (action.effectId === 'subtitle') setSelected(action.id);
              seek(Math.round(action.start * 1000));
            }}
            onCursorDrag={(time) => seek(Math.round(time * 1000))}
            onClickTimeArea={(time) => {
              seek(Math.round(time * 1000));
              return true;
            }}
            getActionRender={(action, row) => {
              if (action.effectId === 'clip') {
                const span = spans.find((entry) => `clip:${entry.clip.id}` === action.id);
                if (!span) return null;
                // The primary clip before any composition is a plain label: it
                // has no Disable/split/delete of its own (ticket 04 decided the
                // single primary clip stays as-is; ticket 05 review shows it).
                if (!composition)
                  return <span className="timeline-action-label">{span.clip.source.name}</span>;
                const inside = editor.clock > span.start_ms && editor.clock < span.end_ms;
                // Focusable so the clip's ContextMenu is reachable without a
                // pointer: Shift+F10 or the Menu key fires the keyboard
                // `contextmenu` the ContextMenu handles, and Enter/Space
                // dispatch the same event. It is a real <button> (the action
                // block's parent still owns the library's pointer/drag), so the
                // keyboard focus is native.
                const label = (
                  <button
                    type="button"
                    aria-haspopup="menu"
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      event.currentTarget.dispatchEvent(
                        new MouseEvent('contextmenu', {
                          bubbles: true,
                          cancelable: true,
                          button: 2,
                          clientX: 0,
                          clientY: 0,
                        }),
                      );
                    }}
                    className={`timeline-action-label${span.clip.enabled ? '' : ' timeline-action-disabled'}`}
                  >
                    {span.clip.source.name}
                  </button>
                );
                return (
                  <ContextMenu
                    label={t('clipContextMenu')}
                    items={[
                      {
                        label: span.clip.enabled ? t('clipDisable') : t('clipEnable'),
                        endContent: <Kbd keys="v" />,
                        onClick: () => toggleClip(span.clip.id, !span.clip.enabled),
                      },
                      {
                        label: t('compositionSplit'),
                        icon: <Icon icon={Scissors} size="sm" />,
                        isDisabled: !inside,
                        onClick: () => splitClip(span.clip.id, editor.clock),
                      },
                      { type: 'divider' },
                      {
                        label: t('clipDelete'),
                        icon: <Icon icon={Trash2} size="sm" />,
                        onClick: () => void deleteClip(span.clip.id),
                      },
                    ]}
                  >
                    {label}
                  </ContextMenu>
                );
              }
              // Raw <span> is a documented UI-CC06 structural exception: this renders inside
              // react-timeline-editor's own action-block DOM, a foreign specialist-timeline slot
              // Astryx does not own, not app chrome. One truncated line per block — the
              // timeline is a scrubbing/placement surface, not where the full text is read.
              if (action.effectId === 'original')
                // The one existing waveform path renders here, inside the original lane's own
                // action block, so it is scaled and scrolled with the timeline.
                return <div ref={wave} className="timeline-waveform" aria-hidden="true" />;
              const subtitleText =
                action.effectId === 'subtitle' && row.id.startsWith('subtitles:')
                  ? getTextLayer(
                      textSnapshot,
                      row.id.slice('subtitles:'.length) as TextLayerName,
                    ).cues.find((cue) => cue.id === action.id)?.text
                  : undefined;
              return (
                <span className="timeline-action-label">
                  {action.effectId === 'subtitle'
                    ? subtitleText
                    : action.effectId === 'music'
                      ? (soundtrack?.source.name ?? '')
                      : (voiceLabels.get(action.id) ?? '')}
                </span>
              );
            }}
          />
        </div>
      </div>
    </section>
  );
}
