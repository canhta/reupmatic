import path from 'node:path';
import type { BrowserWindow } from 'electron';
import type { BatchQueue } from '../../../core/batch/batch-queue.js';
import type { WorkspaceCatalog } from '../../../core/catalog/workspace-catalog.js';
import type { LibraryService } from '../../../core/library/library-service.js';
import type { RegisteredVideo } from '../../../core/media/media-types.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import { errorCode, type IpcWire, requestId, requestRecord } from '../../runtime/ipc.js';
import { installWorkflows } from '../automation/ipc.js';
import { installDistribution } from '../distribution/ipc.js';
import { installProfiles } from '../profiles/ipc.js';
import type { CatalogHost } from './context.js';

interface Host {
  wire: IpcWire;
  workspace: string;
  originalPaths: Set<string>;
  queue?: BatchQueue;
  worker: WorkerClient;
  library(): LibraryService<RegisteredVideo> | undefined;
  resolveLibrary(id: string): Promise<RegisteredVideo>;
  getWindow(): BrowserWindow;
}

export async function installCatalog(host: Host) {
  let catalog: WorkspaceCatalog | undefined;
  let failure = 'CATALOG_UNAVAILABLE';
  try {
    const { WorkspaceCatalog: Catalog } = await import(
      '../../../core/catalog/workspace-catalog.js'
    );
    catalog = new Catalog(path.join(host.workspace, 'catalog.sqlite'));
  } catch (error) {
    failure = errorCode(error);
  }
  const context: CatalogHost = {
    ...host,
    catalog() {
      if (!catalog) throw new Error(failure);
      return catalog;
    },
    library() {
      const library = host.library();
      if (!library) throw new Error('LIBRARY_UNAVAILABLE');
      return library;
    },
    changed() {
      const window = host.getWindow();
      if (window && !window.isDestroyed()) window.webContents.send('reupmatic:catalog-changed');
    },
  };
  const workflows = installWorkflows(context, host.queue, host.worker, host.resolveLibrary);
  host.wire('catalog-snapshot', () => context.catalog().snapshot(workflows.available));
  host.wire('catalog-save-label', (input) => {
    const result = context.catalog().taxonomy.save(input);
    context.changed();
    return result;
  });
  host.wire('catalog-content-labels', (input) => {
    const value = requestRecord(input, ['id', 'expected_revision', 'label_ids']);
    context.library().store.get(requestId(value.id));
    const result = context.catalog().taxonomy.assignContent(input);
    context.changed();
    return result;
  });
  installDistribution(context);
  installProfiles(context);
  return {
    get active() {
      return workflows.active;
    },
    dependencies(id: string) {
      return context.catalog().dependencies(id);
    },
    async close() {
      await workflows.close();
      catalog?.close();
    },
  };
}
