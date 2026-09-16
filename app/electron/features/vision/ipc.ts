import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { parseVisionInput, VisionCoordinator } from '../../../core/vision/vision.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';

interface Host {
  wire: (name: string, handler: (input: unknown) => Promise<unknown> | unknown) => void;
  getWindow: () => BrowserWindow | undefined;
  worker: WorkerClient;
  workspace: string;
  owns: (id: string) => boolean;
  registerArtifact: (id: string, filename: string, assetId: string) => void;
}
export function installVision(host: Host): VisionCoordinator {
  const coordinator = new VisionCoordinator(host.worker);
  coordinator.on('job', (message) => {
    let outgoing = message;
    if (message.event === 'result' && message.data.kind === 'inpainting') {
      const { path: filename, artifact_id: id, ...data } = message.data;
      const renderRoot = path.join(host.workspace, 'renders');
      if (
        typeof filename !== 'string' ||
        path.dirname(path.resolve(filename)) !== renderRoot ||
        path.basename(filename) !== `${id}.mp4`
      ) {
        outgoing = { ...message, event: 'error', data: { code: 'INVALID_WORKER_RESPONSE' } };
      } else {
        host.registerArtifact(id, filename, data.asset_id);
        outgoing = { ...message, data: { ...data, artifact_id: id, url: `media://local/${id}` } };
      }
    }
    const window = host.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('reupmatic:vision-job', outgoing);
  });
  host.wire('vision-status', () => host.worker.request('models.status', {}).result);
  host.wire('vision-start', (value) => {
    const input = parseVisionInput(value);
    if (!host.owns(input.params.asset_id)) throw new Error('UNKNOWN_ASSET');
    const ticket = coordinator.start(input);
    return { request_id: ticket.id, revision: input.revision };
  });
  host.wire('vision-cancel', (value) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).length !== 1 ||
      !('request_id' in value) ||
      typeof value.request_id !== 'string' ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(value.request_id)
    )
      throw new Error('INVALID_REQUEST');
    return coordinator.cancel(value.request_id);
  });
  return coordinator;
}
