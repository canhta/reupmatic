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
const PYTHON_MINOR = `python${PYTHON_VERSION.split('.').slice(0, 2).join('.')}`;
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

// The worker imports stdlib, not the interactive/tooling surface. Drop what a packaged
// interpreter never loads so the installer carries no editor, GUI toolkit or build headers.
const STDLIB_REMOVALS = {
  win32: [
    'Lib/idlelib',
    'Lib/tkinter',
    'Lib/turtle.py',
    'Lib/turtledemo',
    'Lib/ensurepip',
    'Lib/lib2to3',
    'Lib/test',
    'Lib/tests',
    'Lib/pydoc_data',
    'DLLs/_tkinter.pyd',
    'include',
    'libs',
    'share',
    'tcl',
  ],
  default: [
    `${PYTHON_MINOR}/idlelib`,
    `${PYTHON_MINOR}/tkinter`,
    `${PYTHON_MINOR}/turtle.py`,
    `${PYTHON_MINOR}/turtledemo`,
    `${PYTHON_MINOR}/ensurepip`,
    `${PYTHON_MINOR}/lib2to3`,
    `${PYTHON_MINOR}/test`,
    `${PYTHON_MINOR}/tests`,
    `${PYTHON_MINOR}/pydoc_data`,
    'bin/idle3',
    'bin/idle3.14',
    'bin/pip',
    'bin/pip3',
    'bin/pip3.14',
    'bin/pydoc3',
    'bin/pydoc3.14',
    'include',
    'lib/pkgconfig',
    'share',
  ],
};

// Names removed wherever they appear (versioned Tcl/Tk trees, pip's dist-info, GUI launchers).
const STRIP_NAME_PREFIXES = [
  'pip-',
  'pip._vendor',
  'itcl',
  'tcl',
  'tk',
  'libtcl',
  'libtk',
  'thread',
];

async function removeIfPresent(full) {
  await rm(full, { recursive: true, force: true });
}

async function stripInterpreter(tree) {
  const windows = process.platform === 'win32';
  const stdlibRoot = path.join(tree, windows ? 'Lib' : 'lib');
  const stdlib = windows ? stdlibRoot : path.join(stdlibRoot, PYTHON_MINOR);
  const sitePackages = path.join(stdlib, 'site-packages');
  const removals = windows ? STDLIB_REMOVALS.win32 : STDLIB_REMOVALS.default;
  for (const relative of removals) await removeIfPresent(path.join(tree, relative));
  await rm(path.join(sitePackages, 'pip'), { recursive: true, force: true });
  for (const entry of await readdir(sitePackages, { withFileTypes: true }).catch(() => [])) {
    if (entry.name.startsWith('pip-') && entry.name.endsWith('.dist-info')) {
      await removeIfPresent(path.join(sitePackages, entry.name));
    }
  }
  const scanDirs = windows ? ['DLLs', 'Scripts'] : ['lib', 'bin'];
  const scanPrefixes = windows
    ? ['pip', 'idle', 'pydoc', 'tcl', 'tk', '_tkinter']
    : STRIP_NAME_PREFIXES;
  for (const directory of scanDirs) {
    for (const entry of await readdir(path.join(tree, directory), { withFileTypes: true }).catch(
      () => [],
    )) {
      if (scanPrefixes.some((prefix) => entry.name.startsWith(prefix))) {
        await removeIfPresent(path.join(tree, directory, entry.name));
      }
    }
  }
  await stripPackageTests(sitePackages);
}

// `tests`/`test` trees carry fixtures and golden data only; no shipped package imports them.
async function stripPackageTests(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === 'tests' || entry.name === 'test') {
      await removeIfPresent(full);
      continue;
    }
    await stripPackageTests(full);
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

// Import the exact modules each adapter imports and smoke-test the cheap ones; a missing or
// shadowed dependency fails staging here, never a user's job.
const PROBE = `
import importlib.util as u, json, sys, traceback
sys.path.insert(0, 'worker')

result = {}

def check(name, fn):
    try:
        value = bool(fn())
    except Exception as error:
        traceback.print_exc()
        result[name] = False
        print(f"{name}: {type(error).__name__}: {error}", file=sys.stderr)
        return
    result[name] = value
    if not value:
        print(f"{name}: returned false", file=sys.stderr)

def recognition():
    from speech.recognition.models import runtime_available
    import faster_whisper
    return runtime_available() and hasattr(faster_whisper, 'WhisperModel')

def translation():
    from speech.translation.models import runtime_available
    import ctranslate2
    return runtime_available() and hasattr(ctranslate2, 'Translator')

def synthesis():
    from speech.synthesis.models import turbo_runtime_code, nano_runtime_code
    from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine
    from vieneu.v3nano import OnnxV3NanoEngine
    from vieneu_utils.phonemize_text import phonemize_text_with_emotions
    phones = phonemize_text_with_emotions('Xin chào')
    return (
        turbo_runtime_code() is None
        and nano_runtime_code() is None
        and isinstance(phones, str)
        and bool(phones.strip())
    )

def vision():
    import cv2, numpy, onnxruntime
    from rapidocr import RapidOCR
    from rapidocr.utils.typings import EngineType, LangRec, ModelType, OCRVersion
    rgb = numpy.zeros((2, 2, 3), dtype=numpy.uint8)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    return all(
        u.find_spec(name) is not None
        for name in ('numpy', 'cv2', 'onnxruntime', 'rapidocr')
    ) and bgr.shape == (2, 2, 3)

check('speech.faster-whisper', recognition)
check('translation.ctranslate2', translation)
check('synthesis.vieneu', synthesis)
check('vision', vision)

print(json.dumps(result))
raise SystemExit(0 if result and all(result.values()) else 1)
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
run(pythonExe, [
  '-m',
  'pip',
  'install',
  '--no-cache-dir',
  '--no-warn-script-location',
  '-r',
  'worker/requirements.txt',
  '-r',
  'worker/requirements-optional.txt',
]);
// vieneu and rapidocr publish dependency metadata (gradio, librosa, the GUI OpenCV build) that no
// worker code path imports; their real dependencies are declared in the domain requirements.
run(pythonExe, [
  '-m',
  'pip',
  'install',
  '--no-cache-dir',
  '--no-warn-script-location',
  '--no-deps',
  '-r',
  'worker/requirements-sources.txt',
]);

await stripInterpreter(target);
await stripCaches(target);

console.log('probing every adapter runtime');
run(pythonExe, ['-c', PROBE]);

const gib = (await directorySize(target)) / 1024 ** 3;
console.log(`python/ staged (${gib.toFixed(2)} GB)`);
