import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from '@astryxdesign/core/Layout';
import { StackItem } from '@astryxdesign/core/Stack';
import { VStack } from '@astryxdesign/core/VStack';
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// The one drawer frame. `open` makes it a managed drawer (Escape, invoker focus return);
// omitted, it is a persistent frame for an editor region that owns its own lifecycle.
export function SidePanel({
  open,
  label,
  onClose,
  id,
  tabId,
  className,
  actions,
  tabs,
  footer,
  children,
}: {
  open?: boolean;
  label: string;
  onClose(): void;
  id?: string;
  tabId?: string;
  className?: string;
  /** Header actions beside the title, such as a list's Add or More menu. */
  actions?: ReactNode;
  /** View tabs under the title, for a drawer that switches between views of one object. */
  tabs?: ReactNode;
  /** The drawer's actions; the body holds only fields, details and lists. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLElement>(null);
  const invoker = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  const managed = open !== undefined;
  const isOpen = open ?? true;

  useEffect(() => {
    if (!managed) return;
    if (isOpen) {
      invoker.current = document.activeElement;
      wasOpen.current = true;
      const frame = requestAnimationFrame(() =>
        panel.current?.querySelector<HTMLElement>('button')?.focus(),
      );
      return () => cancelAnimationFrame(frame);
    }
    if (wasOpen.current) {
      if (invoker.current instanceof HTMLElement) invoker.current.focus();
      invoker.current = null;
      wasOpen.current = false;
    }
  }, [managed, isOpen]);

  if (!isOpen) return null;
  return (
    <aside
      ref={panel}
      className={className ? `side-panel ${className}` : 'side-panel'}
      aria-label={label}
      onKeyDown={
        managed
          ? (event: KeyboardEvent) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return;
              event.stopPropagation();
              // Chromium cancels a confirmation <dialog> opened inside this keydown in the same tick.
              setTimeout(onClose, 0);
            }
          : undefined
      }
    >
      <Layout
        height="fill"
        padding={3}
        defaultHasDividers
        header={
          <LayoutHeader className="side-panel-header">
            <VStack gap={2}>
              <HStack gap={2} vAlign="center">
                <StackItem size="fill">
                  <Heading level={4} maxLines={1}>
                    {label}
                  </Heading>
                </StackItem>
                {actions}
                <IconButton
                  label={t('closeDetail', { label })}
                  tooltip={t('closeDetail', { label })}
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon="close" size="sm" />}
                  onClick={onClose}
                />
              </HStack>
              {tabs}
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent
            className="side-panel-content"
            {...(id ? { id } : {})}
            {...(tabId ? { role: 'tabpanel', 'aria-labelledby': tabId, tabIndex: -1 } : {})}
          >
            <div className="side-panel-body">{children}</div>
          </LayoutContent>
        }
        {...(footer
          ? { footer: <LayoutFooter className="side-panel-footer">{footer}</LayoutFooter> }
          : {})}
      />
    </aside>
  );
}
