import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { VisionCoordinator } from '../../../core/vision/vision.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import type { IpcWire } from '../../runtime/ipc.js';

interface Host {
  wire: IpcWire;
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
  host.wire('vision-start', (input) => {
    if (!host.owns(input.params.asset_id)) throw new Error('UNKNOWN_ASSET');
    const ticket = coordinator.start(input);
    return { request_id: ticket.id, revision: input.revision };
  });
  host.wire('vision-cancel', (input) => coordinator.cancel(input.request_id));
  return coordinator;
}
