import { Selector } from '@astryxdesign/core/Selector';
import { useTranslation } from 'react-i18next';
import type { TextLanguage, TextLayerName } from '../../../../core/subtitles/layers/document';

const LANGUAGES = ['en', 'vi', 'zh'] as const;

export function LayerLanguageField({
  layerName,
  language,
  onChange,
  isDisabled,
}: {
  layerName: TextLayerName;
  language: TextLanguage;
  onChange: (value: TextLanguage) => void;
  isDisabled?: boolean;
}) {
  const { t } = useTranslation();
  if (language) return null;
  return (
    <Selector
      label={t('setLayerLanguage', { layer: t(`textLayer_${layerName}`) })}
      value=""
      isDisabled={isDisabled}
      options={LANGUAGES.map((value) => ({ value, label: t(`visionLanguage_${value}`) }))}
      onChange={(value) => {
        if ((LANGUAGES as readonly string[]).includes(value)) onChange(value as TextLanguage);
      }}
    />
  );
}
