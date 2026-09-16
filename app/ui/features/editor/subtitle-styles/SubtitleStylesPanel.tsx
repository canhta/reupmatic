import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Selector } from '@astryxdesign/core/Selector';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyCueStyle, type SubtitleStyle } from '../../../../core/subtitles/style';
import { useEditor } from '../EditorContext';
import { SubtitleStyleForm } from './SubtitleStyleForm';

export function SubtitleStylesPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [scope, setScope] = useState('global');
  const [dirty, setDirty] = useState(false);
  const [target, setTarget] = useState('');
  const selected = editor.cues.find(cue => cue.id === target);
  const disabled = editor.busy || editor.opening;
  const globalStyle = editor.processing?.subtitle_style;
  function apply(style: SubtitleStyle | undefined) {
    if (scope === 'cue') {
      if (selected) editor.change(applyCueStyle(editor.cues, [selected.id], style));
      return;
    }
    const next = { ...(editor.processing ?? { version: 1 as const }) };
    if (style) next.subtitle_style = style;
    else delete next.subtitle_style;
    editor.changeProcessing(Object.keys(next).length > 1 ? next : undefined);
  }
  return <Collapsible trigger={t('styleTitle')} defaultIsOpen={false}>
    <Selector label={t('styleScope')} value={scope} isDisabled={disabled || dirty}
      options={[{ value: 'global', label: t('styleGlobal') }, { value: 'cue', label: t('styleOneCue') }]}
      onChange={value => { setScope(value); setTarget(editor.selected); }} />
    {scope === 'cue' && <Selector label={t('styleCue')} value={target} isDisabled={disabled || dirty}
      options={editor.cues.map((cue, index) => ({ value: cue.id, label: `${index + 1}. ${cue.text.slice(0, 60)}` }))}
      onChange={setTarget} />}
    {dirty && <p role="status">{t('styleFinishDraft')}</p>}
    {(scope === 'global' || selected) ? <SubtitleStyleForm key={scope === 'cue' ? target : 'global'}
      value={scope === 'cue' ? selected?.style : globalStyle} inherited={scope === 'cue' ? globalStyle : undefined}
      disabled={disabled} onChange={apply} onDirtyChange={setDirty} /> : <p>{t('styleChooseCue')}</p>}
  </Collapsible>;
}
