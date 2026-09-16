import { Timeline } from '@xzdarcy/react-timeline-editor';
import { type RefObject, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { compositionSpans } from '../../../core/editing/composition/document';
import { useEditor } from './EditorContext';

export function TimelineStrip({ wave }: { wave: RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation();
  const {
    activeLayer,
    activeTextLayer,
    media,
    composition,
    duration,
    timeline,
    changeLayerCues: change,
    seek,
    setSelected,
  } = useEditor();
  const cues = activeLayer.cues;
  const spans = useMemo(() => (composition ? compositionSpans(composition) : []), [composition]);
  const rows = useMemo(
    () => [
      ...(composition
        ? [
            {
              id: 'clips',
              actions: spans.map((span) => ({
                id: `clip:${span.clip.id}`,
                start: span.start_ms / 1000,
                end: span.end_ms / 1000,
                effectId: 'clip',
                flexible: false,
                movable: false,
              })),
            },
          ]
        : []),
      {
        id: 'subtitles',
        actions: cues.map((cue) => ({
          id: cue.id,
          start: cue.start_ms / 1000,
          end: cue.end_ms / 1000,
          effectId: 'subtitle',
          minStart: 0,
          maxEnd: duration / 1000,
        })),
      },
    ],
    [cues, spans, composition, duration],
  );
  if (!media) return null;
  const scaleCount = Math.max(4, Math.ceil(duration / 5000));
  return (
    <section className="timeline">
      <p className="field-help">
        {t('textTimelineLayer', { layer: t(`textLayer_${activeTextLayer}`) })}
      </p>
      {composition ? <p className="field-help">{t('compositionClock')}</p> : <div ref={wave} />}
      <Timeline
        ref={timeline}
        editorData={rows}
        effects={{
          subtitle: { id: 'subtitle', name: t(`textLayer_${activeTextLayer}`) },
          clip: { id: 'clip', name: t('compositionTitle') },
        }}
        scale={5}
        scaleWidth={120}
        minScaleCount={scaleCount}
        maxScaleCount={scaleCount}
        style={{ width: '100%', height: composition ? 152 : 112 }}
        onChange={(data) => {
          const positions = new Map(
            data
              .filter((row) => row.id === 'subtitles')
              .flatMap((row) => row.actions.map((action) => [action.id, action] as const)),
          );
          change(
            cues.map((cue) => {
              const action = positions.get(cue.id);
              return action
                ? {
                    ...cue,
                    start_ms: Math.round(action.start * 1000),
                    end_ms: Math.round(action.end * 1000),
                  }
                : cue;
            }),
          );
        }}
        onClickAction={(_event, { action }) => {
          if (action.effectId === 'subtitle') setSelected(action.id);
          seek(Math.round(action.start * 1000));
        }}
        onCursorDrag={(time) => seek(Math.round(time * 1000))}
        onClickTimeArea={(time) => {
          seek(Math.round(time * 1000));
          return true;
        }}
        getActionRender={(action) => (
          <span>
            {action.effectId === 'clip'
              ? spans.find((span) => `clip:${span.clip.id}` === action.id)?.clip.source.name
              : cues.find((cue) => cue.id === action.id)?.text}
          </span>
        )}
      />
    </section>
  );
}
