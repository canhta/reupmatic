import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from '../media/files.js';
import { RemoteError } from '../worker/remote-error.js';
import type { BundleDescriptor } from './model-installer.js';

/** The same ceilings the catalogue installer enforces on a downloaded bundle. A folder the user
 * picked by mistake — a home directory, a mounted volume — is refused rather than walked. */
const MAX_FILE_SIZE = 8 * 1024 ** 3;
const MAX_TOTAL_SIZE = 64 * 1024 ** 3;
const MAX_FILES = 512;
const MAX_DEPTH = 8;

/**
 * The one synthesis architecture this build runs. It is code, not configuration (D-55); the
 * catalogue entry that would ship its weights is absent because no hash for them can be verified
 * from a primary source here, so bring-your-own-bundle is the way it is obtained today.
 */
export const SYNTHESIS_ENGINE = 'vieneu-v3-turbo-onnx';

/** The bilingual engine runs EN and VI. A bundle registered without a hands-on language pick
 * declares both; the worker still refuses a language the bundle cannot serve. */
export const SYNTHESIS_LANGUAGES = ['en', 'vi'] as const;

async function hashTree(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let total = 0;
  async function walk(directory: string, prefix: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) throw new RemoteError('SYNTHESIS_MANIFEST_INVALID');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
        throw new RemoteError('SYNTHESIS_MANIFEST_INVALID');
      }
      if (entry.isDirectory()) {
        await walk(full, relative, depth + 1);
        continue;
      }
      const { size } = await lstat(full);
      total += size;
      if (size > MAX_FILE_SIZE || total > MAX_TOTAL_SIZE || Object.keys(files).length >= MAX_FILES)
        throw new RemoteError('SYNTHESIS_MANIFEST_INVALID');
      // Streamed, never buffered: these are model weights, and a large enough file exceeds the
      // maximum Buffer length outright.
      files[relative] = await hashFile(full);
    }
  }
  await walk(root, '', 0);
  return files;
}

/**
 * Build the same bundle record the catalogue install writes, from files the user already has.
 * The worker's own inspection is the authority on whether the directory is a usable bundle: it
 * refuses a missing, extra or symlinked file and re-hashes every declared file. This only records
 * what is on disk, exactly as `installOfferedModel` does after a download.
 */
export async function describeLocalBundle(
  directory: string,
  engine: string,
  languages: readonly string[],
): Promise<BundleDescriptor> {
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(directory);
  } catch {
    throw new RemoteError('SYNTHESIS_MANIFEST_INVALID');
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new RemoteError('SYNTHESIS_MANIFEST_INVALID');
  }
  const root = await realpath(directory);
  const files = await hashTree(root);
  if (Object.keys(files).length === 0) throw new RemoteError('SYNTHESIS_MANIFEST_INVALID');
  return { engine, directory: root, languages: [...languages], files };
}

/** Write a bundle record atomically, so an interrupted write never leaves a half record behind. */
export async function writeLocalBundleDescriptor(
  target: string,
  directory: string,
  engine: string,
  languages: readonly string[],
): Promise<BundleDescriptor> {
  const descriptor = await describeLocalBundle(directory, engine, languages);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(descriptor, null, 2), 'utf8');
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return descriptor;
}
