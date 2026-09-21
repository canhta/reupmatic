import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { type KeyboardEvent, type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export function DetailSurface({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onClose(): void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const surface = useRef<HTMLElement>(null);
  const invoker = useRef<Element | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      invoker.current = document.activeElement;
      wasOpen.current = true;
      requestAnimationFrame(() => surface.current?.querySelector<HTMLElement>('button')?.focus());
      return;
    }
    if (wasOpen.current) {
      if (invoker.current instanceof HTMLElement) invoker.current.focus();
      invoker.current = null;
      wasOpen.current = false;
    }
  }, [open]);

  if (!open) return null;
  return (
    <aside
      ref={surface}
      className="detail-surface"
      aria-label={label}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.stopPropagation();
        // Chromium cancels a confirmation <dialog> opened inside this keydown in the same tick.
        setTimeout(onClose, 0);
      }}
    >
      <header className="detail-surface-header">
        <Heading level={5}>{label}</Heading>
        <IconButton
          label={t('closeDetail', { label })}
          tooltip={t('closeDetail', { label })}
          variant="ghost"
          size="sm"
          icon={<Icon icon="close" size="sm" />}
          onClick={onClose}
        />
      </header>
      <div className="detail-surface-scroll">{children}</div>
    </aside>
  );
}
