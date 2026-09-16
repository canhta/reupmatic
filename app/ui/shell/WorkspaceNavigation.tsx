import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { useTranslation } from 'react-i18next';

export type WorkspaceArea = 'sources' | 'editor' | 'channels' | 'automation' | 'settings';
const areas = ['sources', 'editor', 'channels', 'automation', 'settings'] as const;

interface Props {
  selected: WorkspaceArea;
  onNavigate: (area: WorkspaceArea) => void;
}

export function WorkspaceNavigation({ selected, onNavigate }: Props) {
  const { t } = useTranslation();
  return (
    <SideNav
      aria-label={t('applicationAreas')}
      header={<img className="brand-logo" src="/brand/logo-white.svg" alt="Reupmatic" />}
      footer={<p className="sidebar-footnote">{t('plannedAreas')}</p>}
    >
      {areas.map(area => (
        <SideNavItem
          key={area}
          label={t(area)}
          isSelected={area === selected}
          onClick={() => onNavigate(area)}
        />
      ))}
    </SideNav>
  );
}
