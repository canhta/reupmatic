import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BatchQueue } from '../dist-core/batch/batch-queue.js';
import { BatchStore } from '../dist-core/batch/batch-store.js';
import { hashFile } from '../dist-core/media/files.js';
import { RenderCoordinator } from '../dist-core/rendering/render-coordinator.js';
import { WorkerClient } from '../dist-core/worker/worker-client.js';
import { pythonExecutable } from './python.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const terminal = new Set(['complete', 'failed', 'cancelled', 'interrupted']);
function errorCode(error) {
  const value = error?.code ?? error?.message;
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,80}$/.test(value) ? value : 'BATCH_FAILED';
}

async function fileIdentity(filename) {
  const canonical = await realpath(path.resolve(filename));
  return { path: canonical, name: path.basename(canonical), sha256: await hashFile(canonical) };
}

async function run() {
  const [manifest, directory, ...extra] = process.argv.slice(2);
  if (!manifest || !directory || extra.length) {
    console.error('Usage: node scripts/batch.mjs manifest.json NEW_WORKSPACE');
    return 2;
  }
  const bytes = await readFile(manifest);
  if (bytes.length > 2 * 1024 * 1024) throw new Error('MANIFEST_TOO_LARGE');
  const items = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 100 ||
    items.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        !item.video ||
        Object.keys(item).some((key) => !['video', 'srt'].includes(key)) ||
        ['video', 'srt'].some(
          (key) =>
            key in item &&
            (typeof item[key] !== 'string' || !item[key] || item[key].includes('\0')),
        ),
    )
  ) {
    throw new Error('INVALID_MANIFEST');
  }
  const workspace = path.resolve(directory);
  // An isolated, new directory prevents a developer run from starting desktop jobs.
  await mkdir(workspace);
  const output = path.join(workspace, 'exports');
  await mkdir(output);
  let store, worker, renderer, queue;
  let failed = 0;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    queue?.beginClose();
    void worker?.stop();
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    store = new BatchStore(path.join(workspace, 'batch.sqlite'));
    worker = new WorkerClient(
      pythonExecutable(root),
      path.join(root, 'worker/main.py'),
      path.join(workspace, 'worker'),
    );
    renderer = new RenderCoordinator(worker);
    queue = new BatchQueue(store, worker, renderer);
    const inputs = [];
    for (const [index, item] of items.entries()) {
      if (interrupted) break;
      try {
        inputs.push({
          video: await fileIdentity(item.video),
          output_dir: output,
          encoding: 'review',
          ...(item.srt ? { subtitle: await fileIdentity(item.srt) } : {}),
        });
      } catch (error) {
        failed++;
        console.log(JSON.stringify({ index, status: 'failed', code: errorCode(error) }));
      }
    }
    if (!interrupted && inputs.length) {
      queue.enqueue(randomUUID(), inputs);
      await new Promise((resolve, reject) => {
        function changed(snapshot) {
          if (
            !interrupted &&
            !snapshot.fault &&
            snapshot.items.some((item) => !terminal.has(item.state))
          )
            return;
          queue.off('changed', changed);
          if (snapshot.fault) reject(new Error(snapshot.fault));
          else resolve();
        }
        queue.on('changed', changed);
        queue.resume();
      });
    }
    for (const job of store.list()) {
      if (job.state !== 'complete') failed++;
      console.log(
        JSON.stringify({
          id: job.id,
          name: job.input.video.name,
          status: job.state,
          code: job.error_code,
          output: job.output,
        }),
      );
    }
    return interrupted ? 130 : failed ? 1 : 0;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    queue?.beginClose();
    await renderer?.close();
    await worker?.stop();
    if (queue) await queue.finishClose();
    else store?.close();
  }
}

try {
  process.exitCode = await run();
} catch (error) {
  console.error(errorCode(error));
  process.exitCode = 1;
}
