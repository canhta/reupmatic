import { Selector } from '@astryxdesign/core/Selector';
import { useTranslation } from 'react-i18next';
import type { TextLanguage, TextLayerName } from '../../../../core/subtitles/layers/document';

const LANGUAGES = ['en', 'vi', 'zh'] as const;

/**
 * Generators no longer ask for a language locally: they read the
 * text layer's own declared language. This is the one inline control shown
 * when that declared language is missing — it writes straight to the
 * layer, never to local state.
 */
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
