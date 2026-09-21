import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyCueStyle, type SubtitleStyle } from '../../../../core/subtitles/style';
import { useEditor } from '../EditorContext';
import { SubtitleStyleForm } from './SubtitleStyleForm';

export function SubtitleStylesPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [customize, setCustomize] = useState(false);
  const [dirty, setDirty] = useState(false);
  const selected = editor.cues.find((cue) => cue.id === editor.selected);
  const disabled = editor.busy || editor.opening;
  const globalStyle = editor.processing?.subtitle_style;
  const scope = customize && selected ? 'cue' : 'global';
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
    <Section
      variant="transparent"
      padding={0}
      className="inspector-panel-section"
      aria-label={t('styleTitle')}
    >
      <CheckboxInput
        label={t('styleCustomizeCue')}
        value={customize}
        isDisabled={disabled || dirty || !selected}
        onChange={setCustomize}
      />
      {customize && !selected && (
        <Text as="p" type="body" role="status">
          {t('styleChooseCue')}
        </Text>
      )}
      {dirty && (
        <Text as="p" type="body" role="status">
          {t('styleFinishDraft')}
        </Text>
      )}
      <SubtitleStyleForm
        key={scope === 'cue' ? selected?.id : 'global'}
        value={scope === 'cue' ? selected?.style : globalStyle}
        inherited={scope === 'cue' ? globalStyle : undefined}
        disabled={disabled}
        onChange={apply}
        onDirtyChange={setDirty}
      />
    </Section>
  );
}
