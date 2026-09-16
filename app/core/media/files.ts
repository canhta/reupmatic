import { constants, createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, open, realpath, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

export async function hashFile(filename: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export async function protectSources(destination: string, sources: Iterable<string>): Promise<void> {
  const resolved = await realpath(destination).catch(() => path.resolve(destination));
  const target = await stat(destination).catch(() => null);
  for (const source of sources) {
    const original = await realpath(source).catch(() => path.resolve(source));
    const info = await stat(source).catch(() => null);
    if (resolved === original || (target && info && target.ino !== 0
      && target.ino === info.ino && target.dev === info.dev)) throw new Error('SOURCE_OVERWRITE');
  }
}

export async function saveChosenExport(
  source: string, filename: string, protectedSources: Iterable<string>,
  checkActive: () => void = () => undefined,
): Promise<void> {
  const originals = [source, ...protectedSources];
  const directory = await realpath(path.dirname(filename));
  const destination = path.join(directory, path.basename(filename));
  const inspect = () => lstat(destination).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const initial = await inspect();
  if (initial && (!initial.isFile() || initial.isSymbolicLink())) throw new Error('OUTPUT_CONFLICT');
  await protectSources(destination, originals);
  checkActive();
  const expected = await hashFile(source);
  const temporary = path.join(directory, `.reupmatic-${randomUUID()}.partial`);
  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL);
    if (await hashFile(temporary) !== expected) throw new Error('OUTPUT_CHANGED');
    const handle = await open(temporary, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    checkActive();
    if (await realpath(path.dirname(filename)) !== directory) throw new Error('OUTPUT_DIRECTORY_CHANGED');
    await protectSources(destination, originals);
    const current = await inspect();
    if (initial ? !current || current.ino !== initial.ino || current.dev !== initial.dev
      || current.size !== initial.size || current.mtimeMs !== initial.mtimeMs : current !== null) {
      throw new Error('OUTPUT_CONFLICT');
    }
    await rename(temporary, destination);
  } finally { await unlink(temporary).catch(() => undefined); }
}
