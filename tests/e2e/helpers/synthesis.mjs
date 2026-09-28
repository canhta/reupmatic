import { execFile } from 'node:child_process';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pythonExecutable } from '../../../scripts/python.mjs';
import { root } from './electron-harness.mjs';

const run = promisify(execFile);

/** The synthesis pack the local manifest lists for this machine, if packs were staged here. */
async function stagedSynthesisPack() {
  const file = path.join(root, 'app/core/speech/runtime-packs.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const platform = `${process.platform}-${process.arch}`;
  return (
    manifest.packs.find((pack) => pack.name === 'synthesis' && pack.platform === platform) ?? null
  );
}

/**
 * Seeds the controlled synthesis bundle and returns its SDK double's directory, for PYTHONPATH.
 * A checkout with staged runtime packs puts the real SDK ahead of PYTHONPATH, so the double is
 * also installed as this profile's synthesis pack, which the worker searches before the staged one.
 */
export async function seedSynthesisBundle(userData, temp) {
  const workspace = path.join(userData, 'integration-workspace');
  await mkdir(workspace, { recursive: true });
  const { stdout } = await run(
    pythonExecutable(root),
    [
      '-c',
      'from pathlib import Path; import sys,json; from synthesis_fixture import bundle,sdk; ' +
        'root=Path(sys.argv[1]); manifest,_=bundle(root); ' +
        'print(json.dumps({"manifest":str(manifest),"sdk":str(sdk(root))}))',
      temp,
    ],
    { env: { ...process.env, PYTHONPATH: path.join(root, 'tests/python') } },
  );
  const { manifest, sdk } = JSON.parse(stdout);
  await writeFile(path.join(workspace, 'local-synthesis.json'), await readFile(manifest, 'utf8'));
  const pack = await stagedSynthesisPack();
  if (pack) {
    const installed = path.join(userData, 'runtime-packs', pack.name, pack.version);
    await mkdir(path.dirname(installed), { recursive: true });
    await symlink(sdk, installed, 'dir');
  }
  return sdk;
}
