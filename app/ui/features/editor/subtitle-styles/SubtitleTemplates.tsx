import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import JASSUB from 'jassub';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultSubtitleStyle, type SubtitleStyle } from '../../../../core/subtitles/style';
import {
  applySubtitleTemplate,
  matchingSubtitleTemplate,
  type SubtitleTemplate,
  subtitleTemplates,
} from '../../../../core/subtitles/templates';
import { unwrap } from '../../../bridge/client';
import { recordRendererDiagnostic } from '../../../shell/diagnostics';
import { useEditor } from '../EditorContext';
import { jassubFontOptions } from '../jassub-fonts';

const SAMPLE_TEXT = 'Chữ đậm thu hút';
const SAMPLE_DURATION_MS = 1400;
/** A time at which every preset shows its fully-shown state. */
const STATIC_TIME_MS = 800;
/** A canvas-only renderer needs a few frames before the static frame is composited. */
const STATIC_FRAMES = 12;
/** A small landscape strip, so the sample line reads legibly in the panel. */
const SAMPLE_CANVAS = { width: 480, height: 220 };
/** A sample-only font bump; the strip is too short for the style's own size to read. */
const SAMPLE_FONT_PCT = 15;
const SAMPLE_CUE = {
  id: 'template-sample',
  start_ms: 0,
  end_ms: SAMPLE_DURATION_MS,
  text: SAMPLE_TEXT,
  words: [
    { text: 'Chữ ', start_ms: 0, end_ms: 300 },
    { text: 'đậm ', start_ms: 300, end_ms: 600 },
    { text: 'thu ', start_ms: 600, end_ms: 900 },
    { text: 'hút', start_ms: 900, end_ms: SAMPLE_DURATION_MS },
  ],
};

function reasonMessage(reason: unknown): string {
  return reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
}

/** Renders the worker's real ASS for one template on a small canvas: static, motion on demand. */
function TemplateThumbnail({
  template,
  disabled,
  selected,
  onSelect,
}: {
  template: SubtitleTemplate;
  disabled: boolean;
  selected: boolean;
  onSelect(): void;
}) {
  const { t } = useTranslation();
  const editor = useEditor();
  const canvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<JASSUB | null>(null);
  const frame = useRef(0);
  const [assText, setAssText] = useState('');
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(false);
  const { asset_id } = editor.media ?? { asset_id: '' };
  const { width, height } = SAMPLE_CANVAS;
  const style = {
    ...applySubtitleTemplate(defaultSubtitleStyle, template),
    font_size_pct: SAMPLE_FONT_PCT,
  };
  const styleKey = JSON.stringify(style);
  const name = t(`styleTemplate_${template.id}`);

  const fail = useCallback(
    (reason: unknown) => {
      setFailed(true);
      recordRendererDiagnostic('warn', 'editor.template-thumbnail-failed', reasonMessage(reason), {
        template: template.id,
      });
    },
    [template.id],
  );

  useEffect(() => {
    if (!asset_id) return;
    let alive = true;
    void unwrap<{ ass_text: string }>(
      window.reupmatic.ass({
        cues: [SAMPLE_CUE],
        revision: editor.revision,
        asset_id,
        canvas: SAMPLE_CANVAS,
        style: JSON.parse(styleKey) as SubtitleStyle,
      }),
    )
      .then((value) => {
        if (alive) setAssText(value.ass_text);
      })
      .catch((reason) => {
        if (alive) fail(reason);
      });
    return () => {
      alive = false;
    };
  }, [asset_id, editor.revision, styleKey, fail]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !assText) return;
    let alive = true;
    let renderer: JASSUB;
    try {
      renderer = new JASSUB({
        canvas: element,
        subContent: '[Script Info]\nScriptType: v4.00+\n',
        queryFonts: false,
        ...jassubFontOptions(),
      });
    } catch (reason) {
      fail(reason);
      return;
    }
    const sized = renderer as unknown as { _videoWidth: number; _videoHeight: number };
    sized._videoWidth = width;
    sized._videoHeight = height;
    instance.current = renderer;
    void renderer.ready
      .then(async () => {
        if (!alive) return;
        await renderer.renderer.setTrack(assText);
        await renderer.resize(true);
        // A canvas-only renderer needs a few frames before the static frame is composited.
        let ticks = 0;
        const still = () => {
          if (!alive) return;
          void renderer.manualRender(
            {
              expectedDisplayTime: performance.now(),
              width,
              height,
              mediaTime: STATIC_TIME_MS / 1000,
            },
            true,
          );
          ticks += 1;
          if (ticks < STATIC_FRAMES) frame.current = requestAnimationFrame(still);
        };
        still();
      })
      .catch((reason) => {
        if (alive) fail(reason);
      });
    return () => {
      alive = false;
      cancelAnimationFrame(frame.current);
      instance.current = null;
      void renderer.destroy();
    };
  }, [assText, fail]);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    if (!active) {
      const renderer = instance.current;
      if (!renderer) return;
      let ticks = 0;
      const still = () => {
        void renderer.manualRender(
          {
            expectedDisplayTime: performance.now(),
            width,
            height,
            mediaTime: STATIC_TIME_MS / 1000,
          },
          true,
        );
        ticks += 1;
        if (ticks < STATIC_FRAMES) frame.current = requestAnimationFrame(still);
      };
      still();
      return;
    }
    const started = performance.now();
    const loop = () => {
      const renderer = instance.current;
      if (renderer) {
        void renderer.manualRender(
          {
            expectedDisplayTime: performance.now(),
            width,
            height,
            mediaTime: ((performance.now() - started) % SAMPLE_DURATION_MS) / 1000,
          },
          true,
        );
      }
      frame.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame.current);
  }, [active]);

  if (failed) return null;
  return (
    <button
      type="button"
      className="template-thumbnail-wrap"
      aria-label={name}
      aria-pressed={selected}
      disabled={disabled}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onClick={onSelect}
    >
      <canvas
        ref={canvas}
        className="template-thumbnail"
        style={{ aspectRatio: `${width} / ${height}` }}
      />
      <Text as="span" display="block" type="body" weight="medium">
        {name}
      </Text>
    </button>
  );
}

export function SubtitleTemplates({
  value,
  disabled,
  onChange,
}: {
  value?: SubtitleStyle;
  disabled: boolean;
  onChange(style: SubtitleStyle): void;
}) {
  const { t } = useTranslation();
  const effective = value ?? defaultSubtitleStyle;
  const current = matchingSubtitleTemplate(effective)?.id;
  return (
    <VStack gap={2}>
      <Text as="p" type="label" weight="semibold">
        {t('styleTemplate')}
      </Text>
      {subtitleTemplates.map((template) => (
        <TemplateThumbnail
          key={template.id}
          template={template}
          disabled={disabled}
          selected={current === template.id}
          onSelect={() => onChange(applySubtitleTemplate(effective, template))}
        />
      ))}
    </VStack>
  );
}
