import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Stack } from '@astryxdesign/core/Stack';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import type { ComponentType, KeyboardEvent, SVGProps } from 'react';
import { Fragment, useRef, useState } from 'react';

export interface RailItem<Id extends string> {
  id: Id;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  hasRuleBefore?: boolean;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function EditorRail<Id extends string>({
  items,
  activeId,
  isDisabled = false,
  label,
  panelId,
  onSelect,
  onCollapse,
  className,
  tooltipPlacement,
}: {
  items: RailItem<Id>[];
  activeId: Id | null;
  isDisabled?: boolean;
  label: string;
  panelId: string | null;
  onSelect: (id: Id) => void;
  onCollapse: () => void;
  className?: string;
  tooltipPlacement: 'start' | 'end';
}) {
  const refs = useRef(new Map<Id, HTMLButtonElement>());
  const [focused, setFocused] = useState<Id>(items[0].id);

  function focusItem(id: Id) {
    setFocused(id);
    refs.current.get(id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Derive the current item from the focused tab: focus can precede React's state commit.
    const active = document.activeElement;
    const activeIndex = items.findIndex((item) => refs.current.get(item.id) === active);
    const index = activeIndex >= 0 ? activeIndex : items.findIndex((item) => item.id === focused);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      focusItem(items[(index + delta + items.length) % items.length].id);
      return;
    }
    if (event.key === 'Escape' && activeId) {
      event.preventDefault();
      onCollapse();
      return;
    }
    if (event.key === 'Tab' && panelId && !event.shiftKey) {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      event.preventDefault();
      (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }
  }

  return (
    <>
      <Stack
        as="div"
        role="tablist"
        aria-orientation="vertical"
        aria-label={label}
        gap={1}
        className={className ? `editor-rail ${className}` : 'editor-rail'}
        onKeyDown={onKeyDown}
      >
        {items.map((item) => (
          <Fragment key={item.id}>
            {item.hasRuleBefore && <div aria-hidden="true" className="editor-rail-rule" />}
            <IconButton
              ref={(node: HTMLButtonElement | null) => {
                if (node) refs.current.set(item.id, node);
                else refs.current.delete(item.id);
              }}
              role="tab"
              id={`tab-${item.id}`}
              data-rail-item={item.id}
              aria-controls={activeId === item.id && panelId ? panelId : undefined}
              aria-selected={activeId === item.id}
              tabIndex={focused === item.id ? 0 : -1}
              isDisabled={isDisabled}
              label={item.label}
              variant={activeId === item.id ? 'secondary' : 'ghost'}
              icon={<Icon icon={item.icon} size="md" />}
              onFocus={() => setFocused(item.id)}
              onClick={() => {
                setFocused(item.id);
                onSelect(item.id);
              }}
            />
          </Fragment>
        ))}
      </Stack>
      {}
      {items.map((item) => (
        <Tooltip
          key={`tip-${item.id}`}
          anchorRef={{ current: refs.current.get(item.id) ?? null }}
          content={item.label}
          placement={tooltipPlacement}
        />
      ))}
    </>
  );
}
