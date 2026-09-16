import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashFile } from '../media/files.js';
import { RemoteError } from '../worker/remote-error.js';

export function outputFilename(name: string, jobId: string): string {
  const stem = path.parse(name).name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 60) || 'video';
  // A stable full ID prevents new filenames on retry and different jobs colliding.
  return `${stem}-${jobId}.mp4`;
}

/** Complete an export without overwriting any user file. The same-directory
 * hardlink commit is exclusive. Filesystems without hardlinks fail explicitly;
 * do not quietly fall back to a non-atomic overwrite or delete an existing file.
 */
export async function publishBatchOutput(source: string, directory: string, name: string, expectedHash: string, checkActive: () => void): Promise<string> {
  if (path.basename(name) !== name || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new RemoteError('INVALID_REQUEST');
  const canonical = await fs.realpath(directory).catch(() => { throw new RemoteError('OUTPUT_DIRECTORY_MISSING'); });
  if (canonical !== directory || !(await fs.stat(canonical)).isDirectory()) throw new RemoteError('OUTPUT_DIRECTORY_CHANGED');
  const destination = path.join(directory, name);
  const matches = async (): Promise<boolean> => {
    try {
      const info = await fs.lstat(destination);
      if (!info.isFile() || info.isSymbolicLink() || await hashFile(destination) !== expectedHash) throw new RemoteError('OUTPUT_CONFLICT');
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  };
  // Reconcile a completed copy whose SQLite acknowledgement was interrupted.
  checkActive();
  if (await matches()) return destination;
  const temporary = path.join(directory, `.reupmatic-${randomUUID()}.partial`);
  try {
    checkActive();
    await fs.copyFile(source, temporary, constants.COPYFILE_EXCL);
    if (await hashFile(temporary) !== expectedHash) throw new RemoteError('OUTPUT_CHANGED');
    const handle = await fs.open(temporary, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    checkActive();
    if (await fs.realpath(directory) !== directory) throw new RemoteError('OUTPUT_DIRECTORY_CHANGED');
    try { await fs.link(temporary, destination); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') { if (!await matches()) throw new RemoteError('OUTPUT_CONFLICT'); }
      else if (['EXDEV', 'EPERM', 'ENOTSUP', 'EOPNOTSUPP'].includes((error as NodeJS.ErrnoException).code || '')) throw new RemoteError('OUTPUT_COMMIT_UNSUPPORTED');
      else throw error;
    }
    // After committing, report the output even if Cancel arrived at this boundary.
    return destination;
  } finally { await fs.unlink(temporary).catch(() => undefined); }
}
