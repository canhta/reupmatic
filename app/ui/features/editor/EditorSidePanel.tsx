import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The one shell both of the Editor's side panels wear (D-63): a fixed title row
 * with the panel's own close control, then the scrolling body that the rail
 * item's tab points at. One shell means the left and right columns share a
 * heading height, an inset and a close affordance instead of drifting apart.
 */
export function EditorSidePanel({
  id,
  tabId,
  title,
  onClose,
  className,
  children,
}: {
  id: string;
  tabId: string;
  title: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={className ? `editor-side-panel ${className}` : 'editor-side-panel'}>
      <div className="editor-side-panel-header">
        <Heading level={5} maxLines={1}>
          {title}
        </Heading>
        <IconButton
          label={t('closePanel')}
          tooltip={t('closePanel')}
          size="sm"
          variant="ghost"
          icon={<Icon icon="close" size="sm" />}
          onClick={onClose}
        />
      </div>
      <div
        id={id}
        role="tabpanel"
        aria-labelledby={tabId}
        tabIndex={-1}
        className="editor-side-panel-body"
      >
        {children}
      </div>
    </div>
  );
}
