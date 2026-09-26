import path from 'node:path';
import type { BrowserWindow } from 'electron';
import type { BatchQueue } from '../../../core/batch/batch-queue.js';
import type { WorkspaceCatalog } from '../../../core/catalog/workspace-catalog.js';
import type { DiagnosticRecorder } from '../../../core/diagnostics/recorder.js';
import type {
  ChannelConnectionState,
  Post,
} from '../../../core/distribution/distribution-contracts.js';
import type { Publication } from '../../../core/distribution/publishing/contracts.js';
import type { ContentLibrary } from '../../../core/library/content-library.js';
import type { RegisteredVideo } from '../../../core/media/media-contracts.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import { errorCode, type IpcWire } from '../../runtime/ipc.js';
import { installWorkflows } from '../automation/ipc.js';
import { installDistribution } from '../distribution/ipc.js';
import { installProfiles } from '../profiles/ipc.js';
import type { CatalogHost } from './context.js';

interface Host {
  wire: IpcWire;
  diagnostics?: DiagnosticRecorder;
  workspace: string;
  originalPaths: Set<string>;
  queue?: BatchQueue;
  worker: WorkerClient;
  library(): ContentLibrary | undefined;
  resolveLibrary(id: string): Promise<RegisteredVideo>;
  connections?: () => Readonly<Record<string, ChannelConnectionState>>;
  getWindow(): BrowserWindow;
}

export async function installCatalog(host: Host) {
  let catalog: WorkspaceCatalog | undefined;
  let failure = 'CATALOG_UNAVAILABLE';
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
    connections() {
      return host.connections?.() ?? {};
    },
    changed() {
      const window = host.getWindow();
      if (window && !window.isDestroyed()) window.webContents.send('reupmatic:catalog-changed');
    },
  };
  try {
    const { WorkspaceCatalog: Catalog } = await import(
      '../../../core/catalog/workspace-catalog.js'
    );
    catalog = new Catalog(
      path.join(host.workspace, 'catalog.sqlite'),
      async (contentId, exportId) => {
        const item = context.library().getContent(contentId);
        if (!item.links.some((link) => link.id === exportId && link.kind === 'export'))
          throw new Error('INVALID_EXPORT');
        return context.library().resolveAsset(contentId, exportId);
      },
    );
  } catch (error) {
    failure = errorCode(error);
    host.diagnostics?.record({
      level: 'error',
      source: { process: 'main', module: 'catalog' },
      event: 'catalog.unavailable',
      code: failure,
      message: error instanceof Error ? error.message : undefined,
    });
  }
  const workflows = installWorkflows(context, host.queue, host.worker, host.resolveLibrary);
  host.wire('catalog-snapshot', () =>
    context.catalog().snapshot(workflows.available, context.connections()),
  );
  host.wire('catalog-save-label', (input) => {
    const result = context.catalog().saveLabel(input);
    context.changed();
    return result;
  });
  host.wire('catalog-content-labels', (input) => {
    context.library().getContent(input.id);
    const result = context.catalog().assignContentLabel(input);
    context.changed();
    return result;
  });
  installDistribution(context);
  installProfiles(context);
  return {
    get activeCount() {
      return workflows.activeCount;
    },
    dependencies(id: string) {
      return context.catalog().dependencies(id);
    },
    getPost(id: string): Post {
      return context.catalog().getPost(id);
    },
    setPublication(id: string, publication: Publication): Post {
      return context.catalog().setPublication(id, publication);
    },
    listContentLabels() {
      return context.catalog().listContentLabels();
    },
    assignDouyinTags(contentId: string, tags: Parameters<WorkspaceCatalog['assignDouyinTags']>[1]) {
      return context.catalog().assignDouyinTags(contentId, tags);
    },
    async close() {
      await workflows.close();
      catalog?.close();
    },
  };
}
