import type { BrowserWindow } from 'electron';
import type { WorkspaceCatalog } from '../../../core/catalog/workspace-catalog.js';
import type { ChannelConnectionState } from '../../../core/distribution/distribution-contracts.js';
import type { ContentLibrary } from '../../../core/library/content-library.js';
import type { IpcWire } from '../../runtime/ipc.js';
export interface CatalogHost {
  wire: IpcWire;
  workspace: string;
  originalPaths: Set<string>;
  getWindow(): BrowserWindow;
  catalog(): WorkspaceCatalog;
  library(): ContentLibrary;
  connections(): Readonly<Record<string, ChannelConnectionState>>;
  changed(): void;
}
