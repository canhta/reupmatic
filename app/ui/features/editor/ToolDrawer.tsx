import { HStack } from '@astryxdesign/core/HStack';
import { SizeProvider } from '@astryxdesign/core/SizeContext';
import { VStack } from '@astryxdesign/core/VStack';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { SidePanel } from '../../design-system/SidePanel';

type Slot = 'actions' | 'footer';

interface SlotHost {
  targets: Record<Slot, HTMLElement | null>;
  claim(slot: Slot): () => void;
}

const DrawerSlots = createContext<SlotHost | null>(null);

// Every editor tab panel shares one frame and one density: the header holds list actions, the body
// holds controls, the footer holds commands. A view fills the header and footer through
// DrawerActions/DrawerFooter from wherever its state lives, so no state is lifted for layout.
export function ToolDrawer({
  id,
  tabId,
  label,
  className,
  tabs,
  onClose,
  children,
}: {
  id: string;
  tabId: string;
  label: string;
  className?: string;
  tabs?: ReactNode;
  onClose(): void;
  children: ReactNode;
}) {
  const [claims, setClaims] = useState<Record<Slot, number>>({ actions: 0, footer: 0 });
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  const claim = useCallback((slot: Slot) => {
    setClaims((current) => ({ ...current, [slot]: current[slot] + 1 }));
    return () => setClaims((current) => ({ ...current, [slot]: current[slot] - 1 }));
  }, []);
  const host = useMemo<SlotHost>(
    () => ({ targets: { actions, footer }, claim }),
    [actions, footer, claim],
  );
  return (
    <SizeProvider value="sm">
      <DrawerSlots value={host}>
        <SidePanel
          id={id}
          tabId={tabId}
          label={label}
          className={className}
          tabs={tabs}
          actions={claims.actions ? <HStack ref={setActions} gap={1} vAlign="center" /> : undefined}
          footer={claims.footer ? <VStack ref={setFooter} gap={2} /> : undefined}
          onClose={onClose}
        >
          {children}
        </SidePanel>
      </DrawerSlots>
    </SizeProvider>
  );
}

function DrawerSlot({ slot, children }: { slot: Slot; children: ReactNode }) {
  const host = useContext(DrawerSlots);
  if (!host) throw new Error('Drawer slots require ToolDrawer');
  const { claim } = host;
  useLayoutEffect(() => claim(slot), [claim, slot]);
  const target = host.targets[slot];
  return target ? createPortal(children, target) : null;
}

/** Header actions beside the drawer title: a list's Add and More. */
export function DrawerActions({ children }: { children: ReactNode }) {
  return <DrawerSlot slot="actions">{children}</DrawerSlot>;
}

/** The drawer's commands: status above, one primary at the end. */
export function DrawerFooter({ children }: { children: ReactNode }) {
  return <DrawerSlot slot="footer">{children}</DrawerSlot>;
}
