// Stage relocatable Python + worker deps under `python/`; never cross-build.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Pinned for reproducible releases; bump both together and re-verify SHA256SUMS.
const PYTHON_VERSION = '3.14.7';
const PBSTUDIO_TAG = '20260901';
const TRIPLES = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
};

const triple = TRIPLES[`${process.platform}-${process.arch}`];
if (!triple) {
  console.error(`No python-build-standalone target for ${process.platform}-${process.arch}.`);
  process.exit(1);
}

const asset = `cpython-${PYTHON_VERSION}+${PBSTUDIO_TAG}-${triple}-install_only.tar.gz`;
const release = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBSTUDIO_TAG}`;
const cache = path.join(root, '.cache', 'python-build-standalone');
const target = path.join(root, 'python');
const pythonExe = path.join(
  target,
  ...(process.platform === 'win32' ? ['python.exe'] : ['bin', 'python3']),
);

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed ${url}: ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
}

async function sha256(file) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

async function stripCaches(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__') await rm(full, { recursive: true, force: true });
      else await stripCaches(full);
    } else if (entry.name.endsWith('.pyc')) {
      await rm(full, { force: true });
    }
  }
}

async function directorySize(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else total += (await stat(full)).size;
  }
  return total;
}

const PROBE = `
import importlib.util as u, json, sys
sys.path.insert(0, 'worker')
from speech.recognition.models import runtime_available as whisper, qwen3_asr_runtime_available as qwen
from speech.synthesis.models import turbo_runtime_code, nano_runtime_code
from speech.translation.models import runtime_available as translation
result = {
  'speech.faster-whisper': bool(whisper()),
  'speech.qwen3-asr': bool(qwen()),
  'synthesis.vieneu': turbo_runtime_code() is None and nano_runtime_code() is None,
  'translation.ctranslate2': bool(translation()),
  'vision': all(u.find_spec(n) is not None for n in ('numpy', 'cv2', 'onnxruntime', 'rapidocr')),
}
print(json.dumps(result))
raise SystemExit(0 if all(result.values()) else 1)
`;

await mkdir(cache, { recursive: true });
const sumsFile = path.join(cache, 'SHA256SUMS');
const tarball = path.join(cache, asset);
console.log(`staging python ${PYTHON_VERSION} (${triple})`);
await download(`${release}/SHA256SUMS`, sumsFile);
await download(`${release}/${asset}`, tarball);

const expected = (await readFile(sumsFile, 'utf8'))
  .split('\n')
  .find((line) => line.trim().endsWith(asset))
  ?.split(/\s+/)[0];
if (!expected) throw new Error(`SHA256SUMS has no entry for ${asset}`);
const actual = await sha256(tarball);
if (actual !== expected) throw new Error(`checksum mismatch for ${asset}`);
console.log(`verified ${asset} (${actual.slice(0, 12)}…)`);

await rm(target, { recursive: true, force: true });
// GNU tar reads an absolute `D:\...` archive operand as a remote host spec on Windows, so extract
// using paths relative to the repo root (the runner already uses that as cwd).
run('tar', ['-xzf', path.relative(root, tarball), '-C', '.']);
await stat(pythonExe);

console.log('installing worker requirements into the staged interpreter');
// kaldi-native-fbank publishes no cp314 win_amd64 wheel, so pip builds it from source; MSVC's
// FileTracker then cannot create its .tlog files under the runner's long %TEMP% path.
const pipEnv = { ...process.env };
if (process.platform === 'win32') {
  const buildTmp = path.join(path.parse(root).root, 'reupmatic-build-tmp');
  await mkdir(buildTmp, { recursive: true });
  pipEnv.TMP = buildTmp;
  pipEnv.TEMP = buildTmp;
}
run(
  pythonExe,
  [
    '-m',
    'pip',
    'install',
    '--no-cache-dir',
    '--no-warn-script-location',
    '-r',
    'worker/requirements.txt',
    '-r',
    'worker/requirements-optional.txt',
  ],
  pipEnv,
);

await stripCaches(target);

console.log('probing every adapter runtime');
run(pythonExe, ['-c', PROBE]);

const gib = (await directorySize(target)) / 1024 ** 3;
console.log(`python/ staged (${gib.toFixed(2)} GB)`);
