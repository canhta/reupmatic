import { dialog } from 'electron';
import { realpath, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { BatchQueue } from '../../../core/batch/batch-queue.js';
import type { RegisteredVideo } from '../../../core/media/media-types.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import { parseModelFingerprints } from '../../../core/processing/recipe.js';
import { WorkflowService } from '../../../core/automation/workflow-service.js';
import { requestId, requestRecord, requestRevision } from '../../runtime/ipc.js';
import type { CatalogHost } from '../catalog/context.js';

export function installWorkflows(host: CatalogHost, queue: BatchQueue | undefined, worker: WorkerClient,
  resolveLibrary: (id: string) => Promise<RegisteredVideo>) {
  const directories = new Map<string, string>();
  const available = Boolean(queue) && process.env.REUPMATIC_DEV_AUTOMATION === '1';
  let service: WorkflowService | undefined;
  function runner(): WorkflowService {
    if (!available || !queue) throw new Error('AUTOMATION_DEVELOPER_ONLY');
    service ??= new WorkflowService(host.catalog().workflows, {
      queue, resolveLibrary,
      async resolveModels(processing) {
        return parseModelFingerprints(await worker.request('models.resolve', { processing }).result, processing);
      },
      async checkOutput(directory) {
        if (await realpath(directory) !== directory || !(await stat(directory)).isDirectory()) throw new Error('OUTPUT_DIRECTORY_CHANGED');
      },
    });
    return service;
  }
  host.wire('workflow-pick-output', async () => {
    const chosen = await dialog.showOpenDialog(host.getWindow(), { properties: ['openDirectory', 'createDirectory'] });
    if (chosen.canceled) return null;
    if (directories.size >= 256) throw new Error('CATALOG_LIMIT');
    const name = await realpath(chosen.filePaths[0]);
    const output_id = randomUUID();
    directories.set(output_id, name);
    return { output_id, name };
  });
  host.wire('workflow-save', input => {
    const value = requestRecord(input, ['id', 'expected_revision', 'name', 'item_ids', 'processing', 'output_id', 'archived']);
    const id = requestId(value.id);
    const catalog = host.catalog();
    const output = value.output_id === undefined ? catalog.workflows.get(id).output_dir : directories.get(requestId(value.output_id));
    if (!output) throw new Error('OUTPUT_DIRECTORY_CHANGED');
    if (!Array.isArray(value.item_ids) || value.item_ids.length > 100) throw new Error('INVALID_REQUEST');
    for (const itemId of value.item_ids) host.library().store.get(requestId(itemId));
    const result = catalog.workflows.save(input, output);
    host.changed();
    return result;
  });
  host.wire('workflow-run', async input => {
    const value = requestRecord(input, ['workflow_id', 'expected_revision', 'request_id']);
    try {
      const result = await runner().run(requestId(value.workflow_id), requestRevision(value.expected_revision), requestId(value.request_id));
      return { id: result.id };
    } finally { host.changed(); }
  });
  return {
    available,
    get active() { return service?.active ?? false; },
    async close() { await service?.close(); },
  };
}
