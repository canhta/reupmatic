import { Selector } from '@astryxdesign/core/Selector';
import { useTranslation } from 'react-i18next';

const languages = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
];

export function LocaleSelect() {
  const { i18n } = useTranslation();
  return (
    <Selector
      label="Language / Ngôn ngữ"
      isLabelHidden
      value={i18n.language}
      options={languages}
      width={160}
      onChange={language => { void i18n.changeLanguage(language); }}
    />
  );
}
