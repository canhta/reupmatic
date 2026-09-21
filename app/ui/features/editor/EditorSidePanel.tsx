import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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
