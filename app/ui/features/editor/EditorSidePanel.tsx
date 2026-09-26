import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { StackItem } from '@astryxdesign/core/Stack';
import { VStack } from '@astryxdesign/core/VStack';
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
      {/* The block-start inset matches .viewers so every region's first row aligns. */}
      <HStack
        gap={1}
        vAlign="center"
        paddingBlock={2}
        paddingInlineStart={3}
        paddingInlineEnd={1}
        className="editor-side-panel-header"
      >
        <StackItem size="fill">
          <Heading level={5} maxLines={1}>
            {title}
          </Heading>
        </StackItem>
        <IconButton
          label={t('closePanel')}
          tooltip={t('closePanel')}
          size="sm"
          variant="ghost"
          icon={<Icon icon="close" size="sm" />}
          onClick={onClose}
        />
      </HStack>
      <div
        id={id}
        role="tabpanel"
        aria-labelledby={tabId}
        tabIndex={-1}
        className="editor-side-panel-body"
      >
        <VStack gap={6}>{children}</VStack>
      </div>
    </div>
  );
}
