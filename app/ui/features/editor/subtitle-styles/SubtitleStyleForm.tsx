import { useEffect, useRef, useState } from 'react';
import {
  defaultSubtitleStyle,
  firstInvalidSubtitleStyleField,
  parseSubtitleStyle,
  type SubtitleStyle,
} from '../../../../core/subtitles/style';
import { SubtitleStyleFields } from './SubtitleStyleFields';

interface Props {
  value?: SubtitleStyle;
  inherited?: SubtitleStyle;
  disabled: boolean;
  onChange(value: SubtitleStyle): void;
  onFitCover?: (current: SubtitleStyle) => { style: SubtitleStyle; others: number[] } | null;
}

export function SubtitleStyleForm({ value, inherited, disabled, onChange, onFitCover }: Props) {
  const effective = value ?? inherited ?? defaultSubtitleStyle;
  const applied = JSON.stringify(value ?? null);
  const [draft, setDraft] = useState<SubtitleStyle>({ ...effective });
  const appliedRef = useRef(applied);
  // Undo, Reset all or another panel can move the document; only then do the fields resync.
  useEffect(() => {
    if (appliedRef.current === applied) return;
    appliedRef.current = applied;
    setDraft({ ...effective });
  }, [applied, effective]);
  function change(next: SubtitleStyle) {
    setDraft(next);
    // Invalid fields are marked inline and never reach the document.
    if (firstInvalidSubtitleStyleField(next)) return;
    const parsed = parseSubtitleStyle(next);
    appliedRef.current = JSON.stringify(parsed);
    onChange(parsed);
  }
  return (
    <SubtitleStyleFields
      value={draft}
      disabled={disabled}
      onChange={change}
      onFitCover={onFitCover}
    />
  );
}
