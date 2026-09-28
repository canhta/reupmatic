import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashFile } from '../media/files.js';
import { RemoteError } from '../worker/remote-error.js';
import type { BundleDescriptor } from './model-installer.js';

const MAX_FILE_SIZE = 8 * 1024 ** 3;
const MAX_TOTAL_SIZE = 64 * 1024 ** 3;
const MAX_FILES = 512;
const MAX_DEPTH = 8;

export const SYNTHESIS_ENGINE = 'vieneu-v3-turbo-onnx';

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
      // Streamed, never buffered: a model file this large exceeds the maximum Buffer length.
      files[relative] = await hashFile(full);
    }
  }
  await walk(root, '', 0);
  return files;
}

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
