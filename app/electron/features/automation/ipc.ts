import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { dialog } from 'electron';
import { WorkflowService } from '../../../core/automation/workflow-service.js';
import type { BatchQueue } from '../../../core/batch/batch-queue.js';
import type { RegisteredVideo } from '../../../core/media/media-contracts.js';
import { parseModelFingerprints } from '../../../core/processing/recipe.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import type { CatalogHost } from '../catalog/context.js';

export function installWorkflows(
  host: CatalogHost,
  queue: BatchQueue | undefined,
  worker: WorkerClient,
  resolveLibrary: (id: string) => Promise<RegisteredVideo>,
) {
  const directories = new Map<string, string>();
  const available = Boolean(queue) && process.env.REUPMATIC_DEV_AUTOMATION === '1';
  let service: WorkflowService | undefined;
  function runner(): WorkflowService {
    if (!available || !queue) throw new Error('AUTOMATION_DEVELOPER_ONLY');
    service ??= new WorkflowService(host.catalog(), {
      queue,
      resolveLibrary,
      async resolveModels(processing) {
        return parseModelFingerprints(
          await worker.request('models.resolve', { processing }).result,
          processing,
        );
      },
      async checkOutput(directory) {
        if ((await realpath(directory)) !== directory || !(await stat(directory)).isDirectory())
          throw new Error('OUTPUT_DIRECTORY_CHANGED');
      },
    });
    return service;
  }
  host.wire('workflow-pick-output', async () => {
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (chosen.canceled) return null;
    if (directories.size >= 256) throw new Error('CATALOG_LIMIT');
    const name = await realpath(chosen.filePaths[0]);
    const output_id = randomUUID();
    directories.set(output_id, name);
    return { output_id, name };
  });
  host.wire('workflow-save', (input) => {
    const catalog = host.catalog();
    const output =
      input.output_id === undefined
        ? catalog.getWorkflow(input.id).output_dir
        : directories.get(input.output_id);
    if (!output) throw new Error('OUTPUT_DIRECTORY_CHANGED');
    for (const itemId of input.item_ids) host.library().getContent(itemId);
    const result = catalog.saveWorkflow(input, output);
    host.changed();
    return result;
  });
  host.wire('workflow-run', async (input) => {
    try {
      const result = await runner().run(
        input.workflow_id,
        input.expected_revision,
        input.request_id,
      );
      return { id: result.id };
    } finally {
      host.changed();
    }
  });
  return {
    available,
    get activeCount() {
      return service?.activeCount ?? 0;
    },
    async close() {
      await service?.close();
    },
  };
}
