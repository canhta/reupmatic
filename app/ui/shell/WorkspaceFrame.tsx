import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { SidePanel } from '../design-system/SidePanel';

const DrawerSlot = createContext<HTMLElement | null>(null);
const TabVisible = createContext(true);

// A tabbed workspace whose detail drawer spans the full height beside the tab row.
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <DrawerSlot value={slot}>
      <Layout
        className="workspace-frame"
        height="fill"
        content={
          <LayoutContent padding={0} isScrollable={false}>
            {/* Padding lives here, not on LayoutContent: its padding vars would offset every
                nested Astryx edge compensation, such as a table's sticky header. */}
            <div className="workspace-frame-content">{children}</div>
          </LayoutContent>
        }
        end={<VStack ref={setSlot} />}
      />
    </DrawerSlot>
  );
}

// Tabs stay mounted so drafts survive a switch; a hidden tab's drawer must not show.
export function WorkspaceTabPanel({
  id,
  tabId,
  active,
  children,
}: {
  id: string;
  tabId: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div role="tabpanel" id={id} aria-labelledby={tabId} hidden={!active}>
      <TabVisible value={active}>{children}</TabVisible>
    </div>
  );
}

export function WorkspaceDrawer({
  open,
  label,
  onClose,
  actions,
  footer,
  children,
}: {
  open: boolean;
  label: string;
  onClose(): void;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const slot = useContext(DrawerSlot);
  const visible = useContext(TabVisible);
  if (!slot || !visible) return null;
  // Stays mounted while closed so SidePanel can return focus to the row that opened it.
  return createPortal(
    <SidePanel
      open={open}
      className="workspace-drawer"
      label={label}
      onClose={onClose}
      actions={actions}
      footer={footer}
    >
      {children}
    </SidePanel>,
    slot,
  );
}
