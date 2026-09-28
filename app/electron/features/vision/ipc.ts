import type { BrowserWindow } from 'electron';
import { VisionCoordinator } from '../../../core/vision/vision.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import type { IpcWire } from '../../runtime/ipc.js';

interface Host {
  wire: IpcWire;
  getWindow: () => BrowserWindow | undefined;
  worker: WorkerClient;
  owns: (id: string) => boolean;
}
export function installVision(host: Host): VisionCoordinator {
  const coordinator = new VisionCoordinator(host.worker);
  coordinator.on('job', (message) => {
    const window = host.getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('reupmatic:vision-job', message);
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
