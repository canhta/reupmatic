import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultSubtitleStyle, parseSubtitleStyle, type SubtitleStyle } from '../../../../core/subtitles/style';
import { SubtitleStyleFields } from './SubtitleStyleFields';

interface Props {
  value?: SubtitleStyle;
  inherited?: SubtitleStyle;
  disabled: boolean;
  onChange(value: SubtitleStyle | undefined): void;
  onDirtyChange?(dirty: boolean): void;
}

export function SubtitleStyleForm({ value, inherited, disabled, onChange, onDirtyChange }: Props) {
  const { t } = useTranslation();
  const effective = value ?? inherited ?? defaultSubtitleStyle;
  const current = JSON.stringify({ value: value ?? null, effective });
  const [baseline, setBaseline] = useState(current);
  const [original, setOriginal] = useState(JSON.stringify(effective));
  const [draft, setDraft] = useState<SubtitleStyle>({ ...effective });
  const [error, setError] = useState(false);
  const dirty = JSON.stringify(draft) !== original;
  const stale = baseline !== current;
  function reload() {
    setDraft({ ...effective }); setBaseline(current); setOriginal(JSON.stringify(effective)); setError(false);
  }
  useEffect(() => {
    if (!dirty && stale) reload();
  }, [current, dirty]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  function apply() {
    try {
      if (stale) return;
      const next = parseSubtitleStyle(draft);
      onChange(next);
      setDraft(next); setOriginal(JSON.stringify(next)); setError(false);
    } catch { setError(true); }
  }
  return <div className="business-form">
    <p className="field-help">{t('styleUnitsHelp')}</p>
    <SubtitleStyleFields value={draft} disabled={disabled} onChange={setDraft} />
    {error && <Banner status="error" title={t('styleInvalid')} />}
    {stale && dirty && <Banner status="warning" title={t('styleStale')} />}
    <div className="action-row">
      <Button label={t('styleApply')} variant="primary" isDisabled={disabled || stale} onClick={apply} />
      <Button label={t('styleDiscard')} isDisabled={disabled || (!dirty && !stale)} onClick={reload} />
      <Button label={t('styleInherit')} isDisabled={disabled || stale || !value}
        onClick={() => { onChange(undefined); setOriginal(JSON.stringify(draft)); }} />
    </div>
    <p className="field-help">{t('styleSrtHelp')}</p>
  </div>;
}
