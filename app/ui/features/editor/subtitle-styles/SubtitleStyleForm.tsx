import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  onChange(value: SubtitleStyle | undefined): void;
}

export function SubtitleStyleForm({ value, inherited, disabled, onChange }: Props) {
  const { t } = useTranslation();
  const effective = value ?? inherited ?? defaultSubtitleStyle;
  const applied = JSON.stringify(value ?? null);
  const [draft, setDraft] = useState<SubtitleStyle>({ ...effective });
  const appliedRef = useRef(applied);
  // Undo or another panel can move the document; only then do the fields resync.
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
    <VStack gap={3}>
      <SubtitleStyleFields value={draft} disabled={disabled} onChange={change} />
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Button
          label={t('styleInherit')}
          isDisabled={disabled || !value}
          onClick={() => {
            appliedRef.current = JSON.stringify(null);
            onChange(undefined);
          }}
        />
      </HStack>
      <Text as="p" type="supporting">
        {t('styleSrtHelp')}
      </Text>
    </VStack>
  );
}
