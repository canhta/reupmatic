import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, rmdir, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { RemoteError } from '../worker/remote-error.js';
import type { RuntimePackEntry, RuntimePackName } from './runtime-packs.js';

export interface PackDownloadResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body: AsyncIterable<Uint8Array> | null;
}
export type PackDownload = (
  url: string,
  init: { signal?: AbortSignal },
) => Promise<PackDownloadResponse>;
export type PackExtract = (archive: string, destination: string) => Promise<void>;

export interface PackProgress {
  readonly phase: 'downloading' | 'verifying' | 'installing';
  readonly fraction: number | null;
}

export interface PackInstallOptions {
  readonly entry: RuntimePackEntry;
  readonly packRoot: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: PackProgress) => void;
  readonly download?: PackDownload;
  readonly freeSpace?: (directory: string) => Promise<number>;
  readonly extract?: PackExtract;
}

export interface PackInstallResult {
  readonly name: RuntimePackName;
  readonly version: string;
  readonly directory: string;
}

const defaultDownload: PackDownload = async (url, init) => {
  const response = await fetch(url, init);
  return { ok: response.ok, status: response.status, body: response.body };
};

async function defaultFreeSpace(directory: string): Promise<number> {
  const stats = await statfs(directory);
  return stats.bavail * stats.bsize;
}

// System tar handles gzip and large archives without buffering; bsdtar ships on Windows 10+.
async function extractTarGz(archive: string, destination: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archive, '-C', destination], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.on('error', () => reject(new RemoteError('PACK_EXTRACT_FAILED')));
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new RemoteError('PACK_EXTRACT_FAILED')),
    );
  });
}

function assertActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RemoteError('CANCELLED');
}

export function installedPackDirectory(
  packRoot: string,
  name: RuntimePackName,
  version: string,
): string {
  return path.join(packRoot, name, version);
}

export async function packIsInstalled(
  packRoot: string,
  name: RuntimePackName,
  version: string,
): Promise<boolean> {
  try {
    return (await stat(installedPackDirectory(packRoot, name, version))).isDirectory();
  } catch {
    return false;
  }
}

// Download → verify → extract to staging → atomic rename. An interrupted install leaves nothing:
// the archive, the staging directory and (only if the rename already happened) the version
// directory are all removed before the error is rethrown.
export async function installRuntimePack(options: PackInstallOptions): Promise<PackInstallResult> {
  const { entry, packRoot, signal, onProgress } = options;
  const download = options.download ?? defaultDownload;
  const freeSpace = options.freeSpace ?? defaultFreeSpace;
  const extract = options.extract ?? extractTarGz;

  await mkdir(packRoot, { recursive: true });
  const finalDirectory = installedPackDirectory(packRoot, entry.name, entry.version);
  const staging = path.join(packRoot, `.staging-${entry.name}-${randomUUID()}`);
  const archive = path.join(packRoot, `.download-${entry.name}-${randomUUID()}.tar.gz`);
  let moved = false;

  try {
    assertActive(signal);
    // Download plus an equal-sized extraction while it is unpacked.
    const free = await freeSpace(packRoot);
    if (free < entry.size * 2) throw new RemoteError('RUNTIME_PACK_DISK_LOW');

    const response = await download(entry.url, { signal }).catch(() => {
      if (signal?.aborted) throw new RemoteError('CANCELLED');
      throw new RemoteError('PACK_DOWNLOAD_FAILED');
    });
    if (!response.ok || !response.body) throw new RemoteError('PACK_DOWNLOAD_FAILED');
    const hash = createHash('sha256');
    let received = 0;
    const metering = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        received += chunk.length;
        onProgress?.({
          phase: 'downloading',
          fraction: entry.size > 0 ? Math.min(1, received / entry.size) : null,
        });
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.from(response.body),
      metering,
      createWriteStream(archive, { flags: 'wx' }),
    );
    onProgress?.({ phase: 'verifying', fraction: null });
    const actual = hash.digest('hex');
    if (received !== entry.size || actual !== entry.sha256) {
      throw new RemoteError('PACK_HASH_MISMATCH');
    }

    assertActive(signal);
    onProgress?.({ phase: 'installing', fraction: null });
    await mkdir(staging, { recursive: true });
    await extract(archive, staging);
    if ((await readdir(staging)).length === 0) throw new RemoteError('PACK_EXTRACT_FAILED');

    assertActive(signal);
    await rm(finalDirectory, { recursive: true, force: true });
    await mkdir(path.dirname(finalDirectory), { recursive: true });
    await rename(staging, finalDirectory);
    moved = true;
    return { name: entry.name, version: entry.version, directory: finalDirectory };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (moved) await rm(finalDirectory, { recursive: true, force: true });
    if (signal?.aborted) throw new RemoteError('CANCELLED');
    throw error;
  } finally {
    await rm(archive, { force: true });
  }
}

export async function uninstallRuntimePack(
  packRoot: string,
  name: RuntimePackName,
  version: string,
): Promise<{ removed: boolean }> {
  const directory = installedPackDirectory(packRoot, name, version);
  const present = await stat(directory)
    .then(() => true)
    .catch(() => false);
  await rm(directory, { recursive: true, force: true });
  // Prune the per-name directory once its last version is gone.
  const parent = path.join(packRoot, name);
  if ((await readdir(parent).catch(() => null))?.length === 0) {
    await rmdir(parent).catch(() => undefined);
  }
  return { removed: present };
}

// Discard a host that died mid-transfer: staging and download scratch never survive a launch.
export async function discardStalePacks(packRoot: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(packRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await Promise.all(
    entries
      .filter((name) => name.startsWith('.staging-') || name.startsWith('.download-'))
      .map((name) => rm(path.join(packRoot, name), { recursive: true, force: true })),
  );
}
