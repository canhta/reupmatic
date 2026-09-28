import { Section } from '@astryxdesign/core/Section';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
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

type Scope = 'global' | 'cue';

export function SubtitleStylesPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [scope, setScope] = useState<Scope>('global');
  const selected = editor.cues.find((cue) => cue.id === editor.selected);
  const disabled = editor.busy || editor.opening;
  const globalStyle = editor.processing?.subtitle_style;
  const effectiveScope: Scope = scope === 'cue' && selected ? 'cue' : 'global';
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
    if (effectiveScope === 'cue' && selected) {
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
        <Selector
          label={t('styleApplyTo')}
          value={effectiveScope}
          isDisabled={disabled}
          options={[
            { value: 'global', label: t('styleApplyGlobal') },
            { value: 'cue', label: t('styleApplyCue'), disabled: !selected },
          ]}
          onChange={(next) => setScope(next === 'cue' ? 'cue' : 'global')}
        />
        <SubtitleTemplates
          value={effectiveScope === 'cue' ? selected?.style : globalStyle}
          disabled={disabled}
          onChange={apply}
        />
        <SubtitleStyleForm
          key={effectiveScope === 'cue' ? selected?.id : 'global'}
          value={effectiveScope === 'cue' ? selected?.style : globalStyle}
          inherited={effectiveScope === 'cue' ? globalStyle : undefined}
          disabled={disabled}
          coverToggle={Switch}
          onChange={apply}
          onFitCover={regions.length ? fitCover : undefined}
        />
      </VStack>
    </Section>
  );
}
