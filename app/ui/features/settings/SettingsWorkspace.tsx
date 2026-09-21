import { Icon } from '@astryxdesign/core/Icon';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { VStack } from '@astryxdesign/core/VStack';
import {
  CircleUserRound,
  Settings as GeneralIcon,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { categoryLabel, type SettingsCategory, SettingsPanel } from './SettingsPanel';

const categoryOrder: readonly SettingsCategory[] = ['general', 'processing', 'account', 'advanced'];

const categoryIcons = {
  general: GeneralIcon,
  processing: Sparkles,
  account: CircleUserRound,
  advanced: SlidersHorizontal,
} as const;

export function SettingsWorkspace({
  category,
  onCategoryChange,
}: {
  category: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}) {
  const { t } = useTranslation();
  return (
    <VStack gap={4}>
      <TabList
        value={category}
        onChange={(value) => onCategoryChange(value as SettingsCategory)}
        aria-label={t('settingsCategories')}
      >
        {categoryOrder.map((id) => (
          <Tab
            key={id}
            value={id}
            label={t(categoryLabel[id])}
            icon={<Icon icon={categoryIcons[id]} size="sm" strokeWidth={1.5} />}
          />
        ))}
      </TabList>
      <SettingsPanel category={category} />
    </VStack>
  );
}
