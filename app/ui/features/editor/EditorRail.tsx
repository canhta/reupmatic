import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Stack } from '@astryxdesign/core/Stack';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import type { ComponentType, KeyboardEvent, SVGProps } from 'react';
import { Fragment, useRef, useState } from 'react';

export interface RailItem<Id extends string> {
  id: Id;
  /** Accessible name and tooltip text — the rail is icon-only (D-63). */
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Draws the one presentational rule above this item. */
  hasRuleBefore?: boolean;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * One icon rail, used by both of the Editor's edges (D-63): the source rail at
 * the window's left edge and the tool rail at its right. Astryx ships no
 * vertical tablist (TabList is horizontal-only; Toolbar is a horizontal bar and
 * SideNav is app navigation — see the gap row), so
 * this composes a real `role="tablist"` from Astryx IconButtons with the
 * WAI-ARIA tabs keyboard model: Up/Down move, Enter/Space open, Tab moves into
 * the open panel and Escape collapses it. Every pixel of an item — size,
 * centring, hover, selected and focus states — is IconButton's, not ours.
 */
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
  /** DOM id of the open panel, so Tab out of the rail lands inside it. */
  panelId: string | null;
  onSelect: (id: Id) => void;
  onCollapse: () => void;
  className?: string;
  /** Which side of the rail the tooltips open on — away from the window edge. */
  tooltipPlacement: 'start' | 'end';
}) {
  const refs = useRef(new Map<Id, HTMLButtonElement>());
  const [focused, setFocused] = useState<Id>(items[0].id);

  function focusItem(id: Id) {
    setFocused(id);
    refs.current.get(id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Derive the current item from the focused tab, not React state: a
    // programmatic focus (or a focus+key in the same tick) has not committed
    // its state update yet, and the event must move from where the user is.
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
    // Tab out of the rail lands in the open panel, per the tabs pattern, even
    // when the panel is rendered before the rail in the studio row.
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
          // Flat children: a tablist owns tabs, so the rule between item groups
          // is a sibling with no role of its own, hidden from assistive tech.
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
      {/* The rail is icon-only (D-63), and its tooltips render as siblings of
        the tablist, anchored to each item: IconButton's own `tooltip` prop
        renders the tooltip inline beside the button, which would put a
        `role="tooltip"` element inside a tablist that may own only tabs. */}
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
