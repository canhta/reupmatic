import type { HostEventMethods } from '../core/host-bridge/events.js';
import type { HostOperationMethods } from '../core/host-bridge/operations.js';
import type { Capabilities, Reply } from './bridge/client';
import type { MenuCommandId } from './shell/menuCommands';
import type { WorkspaceArea } from './shell/WorkspaceNavigation';

/**
 * `hello`'s `Capabilities` result and `onMenuCommand`'s `MenuCommandId`/`WorkspaceArea` payload
 * are renderer-only vocabulary (`app/ui/bridge/client.ts`, `app/ui/shell/`) that
 * `app/core/host-bridge/` can't import; this is the one place that narrows those two operations
 * back onto their precise shape. Every other operation and event keeps the registry's own type.
 */
type HostOperations = Omit<HostOperationMethods, 'hello'> &
  Omit<HostEventMethods, 'onMenuCommand'> & {
    hello(): Promise<Reply<Capabilities>>;
    onMenuCommand(
      callback: (message: { command: MenuCommandId; area?: WorkspaceArea; data?: unknown }) => void,
    ): () => void;
    // Not a wire operation (no `reupmatic:` IPC round trip) — see preload.cts.
    getPathForFile(file: File): string;
  };

declare global {
  interface Window {
    reupmatic: HostOperations;
  }
}
