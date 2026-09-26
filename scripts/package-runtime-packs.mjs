// Build one runtime pack for the current platform against the pinned CPython, then write the
// generated manifest the app embeds. Never cross-build. See docs/adr/0002-runtime-packs.md.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON_VERSION = '3.14.7';
const PBSTUDIO_TAG = '20260901';
const TRIPLES = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
};

const platform = `${process.platform}-${process.arch}`;
const triple = TRIPLES[platform];
if (!triple) {
  console.error(
    `No runtime pack target for ${platform}; expected ${Object.keys(TRIPLES).join(', ')}.`,
  );
  process.exit(1);
}

const version = process.env.REUPMATIC_PACK_VERSION || '1';
const workspace = path.join(root, 'python');
const packRoot = path.join(workspace, 'runtime-packs');
const outputRoot = path.join(root, 'release', 'runtime-packs');
const manifestPath = path.join(root, 'app', 'core', 'speech', 'runtime-packs.json');
const cache = path.join(root, '.cache', 'python-build-standalone');
const asset = `cpython-${PYTHON_VERSION}+${PBSTUDIO_TAG}-${triple}-install_only.tar.gz`;
const executable = (name) => (process.platform === 'win32' ? `${name}.exe` : name);
const basePython =
  process.platform === 'win32'
    ? path.join(workspace, 'python.exe')
    : path.join(workspace, 'bin', 'python3');

const PACKS = {
  synthesis: {
    requirements: 'worker/requirements-pack-synthesis.txt',
    sources: 'worker/requirements-sources-synthesis.txt',
    probe: `
import sys
from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine
from vieneu.v3nano import OnnxV3NanoEngine
from vieneu_utils.phonemize_text import phonemize_text_with_emotions
import kaldi_native_fbank, soundfile, soxr  # noqa: F401
phones = phonemize_text_with_emotions('Xin chào')
raise SystemExit(0 if isinstance(phones, str) and phones.strip() else 1)
`,
  },
  vision: {
    requirements: 'worker/requirements-pack-vision.txt',
    sources: 'worker/requirements-sources-vision.txt',
    probe: `
import cv2, numpy, onnxruntime  # noqa: F401
from rapidocr import RapidOCR  # noqa: F401
from rapidocr.utils.typings import EngineType, LangRec, ModelType, OCRVersion  # noqa: F401
rgb = numpy.zeros((2, 2, 3), dtype=numpy.uint8)
bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
raise SystemExit(0 if bgr.shape == (2, 2, 3) else 1)
`,
  },
};

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}

async function exists(file) {
  return stat(file)
    .then(() => true)
    .catch(() => false);
}

async function sha256(file) {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
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

async function stripPackageTests(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === 'tests' || entry.name === 'test') {
      await rm(full, { recursive: true, force: true });
      continue;
    }
    await stripPackageTests(full);
  }
}

// The shipped base has no pip (it strips it); use a throwaway extraction of the same pinned
// CPython to install into a `--target` directory.
async function builderPython() {
  const scratch = path.join(root, '.cache', 'pack-builder');
  const python = path.join(scratch, 'python', 'bin', executable('python3'));
  const windowsPython = path.join(scratch, 'python', executable('python'));
  const candidate = process.platform === 'win32' ? windowsPython : python;
  if (!(await exists(candidate))) {
    await rm(scratch, { recursive: true, force: true });
    await mkdir(scratch, { recursive: true });
    run('tar', [
      '-xzf',
      path.relative(root, path.join(cache, asset)),
      '-C',
      path.relative(root, scratch),
    ]);
  }
  return candidate;
}

async function signMacos(packDirectory) {
  const identity = process.env.REUPMATIC_MACOS_SIGN_IDENTITY;
  if (process.platform !== 'darwin' || !identity) {
    if (process.platform === 'darwin') {
      console.warn('REUPMATIC_MACOS_SIGN_IDENTITY unset; building an unsigned pack.');
    }
    return;
  }
  // Sign every Mach-O so the app's library-validation entitlement can load the pack at run time.
  const script = [
    `set -euo pipefail`,
    `find "${packDirectory}" -type f \\( -name '*.dylib' -o -name '*.so' -o -name '*.node' \\) -print0 | ` +
      `xargs -0 -r codesign --force --timestamp --options runtime --sign "${identity}"`,
  ].join('\n');
  run('bash', ['-c', script]);
}

if (!(await exists(basePython))) {
  throw new Error('python/ is not staged; run `pnpm run stage:python` first.');
}
const builder = await builderPython();

const entries = [];
for (const [name, pack] of Object.entries(PACKS)) {
  console.log(`building ${name} pack (${platform} ${version})`);
  const packDirectory = path.join(packRoot, name, version);
  await rm(packDirectory, { recursive: true, force: true });
  await mkdir(packDirectory, { recursive: true });
  run(builder, [
    '-m',
    'pip',
    'install',
    '--no-cache-dir',
    '--no-warn-script-location',
    '--no-deps',
    '--target',
    packDirectory,
    '-r',
    pack.requirements,
  ]);
  run(builder, [
    '-m',
    'pip',
    'install',
    '--no-cache-dir',
    '--no-warn-script-location',
    '--no-deps',
    '--target',
    packDirectory,
    '-r',
    pack.sources,
  ]);
  await stripPackageTests(packDirectory);
  await stripCaches(packDirectory);

  console.log(`probing the ${name} pack`);
  run(basePython, ['-c', pack.probe], { ...process.env, PYTHONPATH: packDirectory });

  await signMacos(packDirectory);

  await mkdir(outputRoot, { recursive: true });
  const archiveName = `${name}-${platform}-${version}.tar.gz`;
  const archive = path.join(outputRoot, archiveName);
  await rm(archive, { force: true });
  run('tar', ['-czf', path.relative(root, archive), '-C', path.relative(root, packDirectory), '.']);

  const size = await directorySize(packDirectory);
  const digest = await sha256(archive);
  const repo = process.env.GITHUB_REPOSITORY || 'canhta/reupmatic';
  const tag = process.env.REUPMATIC_RELEASE_TAG;
  const url = tag
    ? `https://github.com/${repo}/releases/download/${tag}/${archiveName}`
    : `https://example.invalid/runtime-packs/${archiveName}`;
  entries.push({ name, version, platform, url, sha256: digest, size });
  console.log(
    `${name} pack: ${archiveName} (${(size / 1024 ** 2).toFixed(0)} MB, ${digest.slice(0, 12)}…)`,
  );
}

// The app embeds only this platform's packs; other platforms build their own manifest.
await mkdir(path.dirname(manifestPath), { recursive: true });
await rm(manifestPath, { force: true });
await writeFile(manifestPath, `${JSON.stringify({ packs: entries }, null, 2)}\n`, 'utf8');
console.log(`wrote ${path.relative(root, manifestPath)}`);
