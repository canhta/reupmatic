import type { BrowserWindow } from 'electron';
import type { WorkspaceCatalog } from '../../../core/catalog/workspace-catalog.js';
import type { LibraryService } from '../../../core/library/library-service.js';
import type { RegisteredVideo } from '../../../core/media/media-types.js';
import type { IpcWire } from '../../runtime/ipc.js';
export interface CatalogHost {
  wire: IpcWire;
  workspace: string;
  originalPaths: Set<string>;
  getWindow(): BrowserWindow;
  catalog(): WorkspaceCatalog;
  library(): LibraryService<RegisteredVideo>;
  changed(): void;
}
