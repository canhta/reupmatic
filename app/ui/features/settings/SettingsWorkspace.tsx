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

// Advanced is the last tab, not a separately-grouped rail entry — the usual macOS Settings
// pattern (D-37), unchanged by D-57's move out of the independent window.
const categoryOrder: readonly SettingsCategory[] = ['general', 'processing', 'account', 'advanced'];

// Same pattern as WorkspaceNavigation's areaIcons: lucide-react components passed straight to
// Astryx's Icon, not a second app-owned SVG set.
const categoryIcons = {
  general: GeneralIcon,
  processing: Sparkles,
  account: CircleUserRound,
  advanced: SlidersHorizontal,
} as const;

/**
 * Settings as a main-window destination (D-57, superseding D-47's independent window). Reached
 * from `WorkspaceNavigation`'s bottom-anchored utility slot or the app menu's Settings…
 * command/⌘, (both now navigate here instead of opening a second `BrowserWindow`).
 *
 * D-37's three categories plus collapsed Advanced are preserved verbatim as a TabList in the
 * navigation pattern (no `role`, so the strip is a nav landmark marking the current tab with
 * `aria-current` and roving tabindex) — the same category behaviour the old window's centered
 * toolbar tab strip had, just rehosted in the content column like every other workspace's
 * `.business-area` tabs, per the ticket's "only the window and navigation pattern change".
 *
 * `category`/`onCategoryChange` are lifted to `App.tsx` (not local state) so a generator's
 * "Set up…" link (`useEditorSession.openSettings`) can land on a specific category from
 * anywhere, the same way `area` itself is lifted for cross-workspace navigation.
 */
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
