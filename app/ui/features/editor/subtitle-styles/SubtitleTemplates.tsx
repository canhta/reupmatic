import { Item } from '@astryxdesign/core/Item';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import JASSUB from 'jassub';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultSubtitleStyle, type SubtitleStyle } from '../../../../core/subtitles/style';
import {
  applySubtitleTemplate,
  matchingSubtitleTemplate,
  type SubtitleTemplate,
  subtitleTemplates,
} from '../../../../core/subtitles/templates';
import { unwrap } from '../../../bridge/client';
import { useEditor } from '../EditorContext';

const SAMPLE_TEXT = 'Bold words win';
const SAMPLE_DURATION_MS = 1400;
const SAMPLE_CUE = {
  id: 'template-sample',
  start_ms: 0,
  end_ms: SAMPLE_DURATION_MS,
  text: SAMPLE_TEXT,
  words: [
    { text: 'Bold ', start_ms: 0, end_ms: 400 },
    { text: 'words ', start_ms: 400, end_ms: 800 },
    { text: 'win', start_ms: 800, end_ms: SAMPLE_DURATION_MS },
  ],
};

/** Renders the worker's real ASS for one template on a small canvas, looping the motion. */
function TemplateThumbnail({ template }: { template: SubtitleTemplate }) {
  const editor = useEditor();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [assText, setAssText] = useState('');
  const { asset_id } = editor.media ?? { asset_id: '' };
  const { width, height } = editor.subtitleCanvas;
  const style = applySubtitleTemplate(defaultSubtitleStyle, template);
  const styleKey = JSON.stringify(style);

  useEffect(() => {
    if (!asset_id) return;
    let alive = true;
    void unwrap<{ ass_text: string }>(
      window.reupmatic.ass({
        cues: [SAMPLE_CUE],
        revision: editor.revision,
        asset_id,
        style: JSON.parse(styleKey) as SubtitleStyle,
      }),
    )
      .then((value) => {
        if (alive) setAssText(value.ass_text);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [asset_id, editor.revision, styleKey]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !assText) return;
    let instance: JASSUB;
    let alive = true;
    let frame = 0;
    try {
      instance = new JASSUB({
        canvas: element,
        subContent: '[Script Info]\nScriptType: v4.00+\n',
        queryFonts: false,
      });
    } catch {
      return;
    }
    const sized = instance as unknown as { _videoWidth: number; _videoHeight: number };
    sized._videoWidth = width;
    sized._videoHeight = height;
    void instance.ready
      .then(async () => {
        if (!alive) return;
        await instance.renderer.setTrack(assText);
        await instance.resize(true);
        const started = performance.now();
        const loop = () => {
          if (!alive) return;
          const elapsed = (performance.now() - started) % SAMPLE_DURATION_MS;
          void instance.manualRender(
            {
              expectedDisplayTime: performance.now(),
              width,
              height,
              mediaTime: elapsed / 1000,
            },
            true,
          );
          frame = requestAnimationFrame(loop);
        };
        loop();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      void instance.destroy();
    };
  }, [assText, width, height]);

  return (
    <canvas
      ref={canvas}
      className="template-thumbnail"
      style={{ aspectRatio: `${width} / ${height}` }}
    />
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
    <VStack gap={1}>
      <Text as="p" type="label" weight="semibold">
        {t('styleTemplate')}
      </Text>
      {subtitleTemplates.map((template) => (
        <Item
          key={template.id}
          align="center"
          density="compact"
          isDisabled={disabled}
          aria-current={current === template.id ? 'true' : undefined}
          label={<TemplateThumbnail template={template} />}
          description={t(`styleTemplate_${template.id}`)}
          onClick={() => {
            if (!disabled) onChange(applySubtitleTemplate(effective, template));
          }}
        />
      ))}
    </VStack>
  );
}
