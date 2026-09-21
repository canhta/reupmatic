import { Icon } from '@astryxdesign/core/Icon';
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { Clapperboard, Library, Settings as SettingsIcon, Share2, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type WorkspaceArea = 'sources' | 'editor' | 'channels' | 'automation' | 'settings';
const primaryAreas = ['editor', 'sources', 'automation', 'channels'] as const;

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
