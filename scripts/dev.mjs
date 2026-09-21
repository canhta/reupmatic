import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`)),
    );
  });
}

const tsc = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
);
const astryx = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'astryx.cmd' : 'astryx',
);
await run(astryx, ['theme', 'build', 'app/ui/design-system/theme/appTheme.ts']);

async function buildHost() {
  await run(tsc, ['-p', 'tsconfig.node.json']);
  await run('node', ['scripts/generate-preload.mjs']);
}

await buildHost();

const viteServer = await createServer({ configFile: path.join(root, 'vite.config.ts') });
await viteServer.listen();
const url = viteServer.resolvedUrls?.local?.[0];
if (!url) throw new Error('Vite dev server did not report a local URL');
viteServer.printUrls();

let electronProcess;
let restarting = false;
let shuttingDown = false;

function startElectron() {
  const child = spawn(electron, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, REUPMATIC_DEV_SERVER_URL: url },
  });
  child.on('error', (error) => console.error(error.message));
  child.on('exit', (code) => {
    // A restart kills the old process on purpose; only a real quit shuts the session down.
    if (electronProcess === child && !restarting) void shutdown(code ?? 0);
  });
  electronProcess = child;
}

startElectron();

let building = false;
let pending = false;
let debounce;

async function rebuildAndRestart() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  try {
    await buildHost();
    restarting = true;
    electronProcess?.kill();
    startElectron();
  } catch (error) {
    console.error(`host rebuild failed: ${error.message}`);
  } finally {
    building = false;
    restarting = false;
    if (pending) {
      pending = false;
      void rebuildAndRestart();
    }
  }
}

function scheduleRebuild() {
  clearTimeout(debounce);
  debounce = setTimeout(() => void rebuildAndRestart(), 200);
}

for (const directory of ['app/core', 'app/electron']) {
  watch(path.join(root, directory), { recursive: true }, (_event, filename) => {
    if (filename && /\.(ts|cts|mts|json)$/.test(filename)) scheduleRebuild();
  });
}

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  await viteServer.close();
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
