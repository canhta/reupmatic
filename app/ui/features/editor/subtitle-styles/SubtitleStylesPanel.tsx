import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fitCoverBand } from '../../../../core/subtitles/cover-fit';
import { getTextLayer } from '../../../../core/subtitles/layers/document';
import {
  applyCueStyle,
  defaultCoverBand,
  type SubtitleStyle,
} from '../../../../core/subtitles/style';
import { useEditor } from '../EditorContext';
import { SubtitleStyleForm } from './SubtitleStyleForm';
import { SubtitleTemplates } from './SubtitleTemplates';

export function SubtitleStylesPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [customize, setCustomize] = useState(false);
  const selected = editor.cues.find((cue) => cue.id === editor.selected);
  const disabled = editor.busy || editor.opening;
  const globalStyle = editor.processing?.subtitle_style;
  const scope = customize && selected ? 'cue' : 'global';
  const origin = getTextLayer(editor.textSnapshot, 'displayed').origin;
  const regions = origin.kind === 'ocr' && origin.regions ? origin.regions : [];
  const media = editor.media;
  function fitCover(current: SubtitleStyle) {
    if (!media || !regions.length) return null;
    const fit = fitCoverBand(
      regions,
      editor.processing?.editing,
      { width: media.width, height: media.height },
      current.cover ?? defaultCoverBand(current),
    );
    if (!fit) return null;
    return {
      style: { ...current, cover: fit.band },
      others: fit.others.map((r) => Math.round(r.y_pct)),
    };
  }
  function apply(style: SubtitleStyle | undefined) {
    if (scope === 'cue' && selected) {
      editor.change(applyCueStyle(editor.cues, [selected.id], style));
      return;
    }
    const next = { ...(editor.processing ?? {}) };
    if (style) next.subtitle_style = style;
    else delete next.subtitle_style;
    editor.changeProcessing(Object.keys(next).length > 0 ? next : undefined);
  }
  return (
    <Section variant="transparent" padding={0} aria-label={t('styleTitle')}>
      <VStack gap={3}>
        <CheckboxInput
          label={t('styleCustomizeCue')}
          value={customize}
          isDisabled={disabled || !selected}
          onChange={setCustomize}
        />
        {customize && !selected && (
          <Text as="p" type="body" role="status">
            {t('styleChooseCue')}
          </Text>
        )}
        <SubtitleTemplates
          value={scope === 'cue' ? selected?.style : globalStyle}
          disabled={disabled}
          onChange={apply}
        />
        <SubtitleStyleForm
          key={scope === 'cue' ? selected?.id : 'global'}
          value={scope === 'cue' ? selected?.style : globalStyle}
          inherited={scope === 'cue' ? globalStyle : undefined}
          disabled={disabled}
          onChange={apply}
          onFitCover={regions.length ? fitCover : undefined}
        />
      </VStack>
    </Section>
  );
}
