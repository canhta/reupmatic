import { Selector } from '@astryxdesign/core/Selector';
import { useTranslation } from 'react-i18next';
import type { TextLanguage } from '../../../../core/subtitles/layers/document';

const LANGUAGES = ['en', 'vi', 'zh'] as const;

export function LayerLanguageField({
  language,
  onChange,
  isDisabled,
}: {
  language: TextLanguage;
  onChange: (value: TextLanguage) => void;
  isDisabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Selector
      label={t('textLayerLanguage')}
      value={language ?? ''}
      isDisabled={isDisabled}
      options={LANGUAGES.map((value) => ({ value, label: t(`visionLanguage_${value}`) }))}
      onChange={(value) => {
        if ((LANGUAGES as readonly string[]).includes(value)) onChange(value as TextLanguage);
      }}
    />
  );
}
