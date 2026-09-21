import { Icon } from '@astryxdesign/core/Icon';
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { Clapperboard, Library, Settings as SettingsIcon, Share2, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type WorkspaceArea = 'sources' | 'editor' | 'channels' | 'automation' | 'settings';
// D-57 supersedes D-47: Settings returns to the sidebar as a navigation destination, a
// deliberate, owner-weighed deviation from Apple HIG R-A6. D-46's four equal-weight primary
// peers are unchanged; Settings stays the separate utility tier, rendered in SideNav's own
// `footer` slot below (not one of these primaryAreas) — bottom-anchored per D-46, cited there
// rather than as an answer the placement study settled (O2 is recorded unsettled, split 1-1).
const primaryAreas = ['editor', 'sources', 'automation', 'channels'] as const;

// lucide-react components pass straight to Icon's `icon` prop: Astryx's built-in set has no
// destination-specific icons (UI-IC01).
const areaIcons = {
  sources: Library,
  editor: Clapperboard,
  channels: Share2,
  automation: Workflow,
} as const;

interface Props {
  selected: WorkspaceArea;
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  onNavigate: (area: WorkspaceArea) => void;
}

export function WorkspaceNavigation({
  selected,
  isCollapsed,
  onCollapsedChange,
  onNavigate,
}: Props) {
  const { t } = useTranslation();
  return (
    <SideNav
      aria-label={t('applicationAreas')}
      collapsible={{ isCollapsed, onCollapsedChange, hasButton: false }}
      resizable={{ defaultWidth: 212, minWidth: 180, maxWidth: 280 }}
      // D-46's bottom-anchored utility slot, next to the local-processing status footer below
      // the content area — separated from the four peers above, and `size="sm"` keeps it
      // visually smaller too — separated, smaller, or icon-first for the one
      // optional/utility destination.
      footer={
        <SideNavItem
          data-workspace-area="settings"
          size="sm"
          label={t('settings')}
          icon={<Icon icon={SettingsIcon} size="sm" strokeWidth={1.5} />}
          isSelected={selected === 'settings'}
          onClick={() => onNavigate('settings')}
        />
      }
    >
      {primaryAreas.map((area) => (
        <SideNavItem
          key={area}
          data-workspace-area={area}
          label={t(area)}
          icon={<Icon icon={areaIcons[area]} size="sm" strokeWidth={1.5} />}
          isSelected={area === selected}
          onClick={() => onNavigate(area)}
        />
      ))}
    </SideNav>
  );
}
