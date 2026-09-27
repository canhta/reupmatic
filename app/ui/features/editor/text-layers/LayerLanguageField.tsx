import { Selector } from '@astryxdesign/core/Selector';
import { useTranslation } from 'react-i18next';
import type { TextLanguage, TextLayerName } from '../../../../core/subtitles/layers/document';
import type { MessageKey } from '../../../locales/message-key';

const LANGUAGES = ['en', 'vi', 'zh'] as const;

// A dedicated key per layer, not `{{layer}}` interpolation: Vietnamese needs the noun lowercase
// mid-phrase ("Ngôn ngữ nội dung đọc"), which the layer's own standalone label is not.
const LANGUAGE_LABEL_KEY: Record<TextLayerName, MessageKey> = {
  transcript: 'setLayerLanguageTranscript',
  translated: 'setLayerLanguageTranslated',
  spoken: 'setLayerLanguageSpoken',
  displayed: 'setLayerLanguageDisplayed',
};

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
  return (
    <Selector
      label={t(LANGUAGE_LABEL_KEY[layerName])}
      value={language ?? ''}
      isDisabled={isDisabled}
      options={LANGUAGES.map((value) => ({ value, label: t(`visionLanguage_${value}`) }))}
      onChange={(value) => {
        if ((LANGUAGES as readonly string[]).includes(value)) onChange(value as TextLanguage);
      }}
    />
  );
}
