import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { RemoteError } from '../worker/remote-error.js';
import type { CatalogueModel } from './model-catalogue.js';

/** One byte-moving response, narrowed so a test can serve bytes without a real model host. */
export interface DownloadResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body: AsyncIterable<Uint8Array> | null;
}
export type Download = (url: string, init: { signal?: AbortSignal }) => Promise<DownloadResponse>;

export interface InstallProgress {
  readonly phase: 'downloading' | 'verifying' | 'installing';
  readonly fraction: number | null;
}

export interface InstallOptions {
  readonly model: CatalogueModel;
  /** Directory bundles and manifests are written under, e.g. `<workspace>/speech-models`. */
  readonly bundleRoot: string;
  /** Base URL for the model's files; defaults to `https://<source_host>`. */
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: InstallProgress) => void;
  readonly download?: Download;
  /** Free bytes available for `bundleRoot`; injectable so the disk check is testable. */
  readonly freeSpace?: (directory: string) => Promise<number>;
}

export interface InstallResult {
  readonly manifest_path: string;
  readonly directory: string;
  readonly engine: string;
}

/**
 * The one bundle record this boundary has, produced by the catalogue installer and by
 * bring-your-own-bundle alike. It is the shape `speech.configure` and `synthesis.configure`
 * verify; a hand-written example of it is no longer a second mechanism (D-56).
 */
export interface BundleDescriptor {
  readonly engine: string;
  readonly directory: string;
  readonly languages: string[];
  readonly files: Record<string, string>;
}

const defaultDownload: Download = async (url, init) => {
  const response = await fetch(url, init);
  return { ok: response.ok, status: response.status, body: response.body };
};

async function defaultFreeSpace(directory: string): Promise<number> {
  const stats = await statfs(directory);
  return stats.bavail * stats.bsize;
}

function assertActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RemoteError('CANCELLED');
}

/** A slug path segment plus filename, so a catalogue entry can never traverse out of its host. */
function fileUrl(base: string, relative: string): string {
  return `${base.replace(/\/+$/, '')}/${relative}`;
}

export function manifestPath(bundleRoot: string, modelId: string): string {
  return path.join(bundleRoot, `${modelId}.json`);
}

/**
 * Remove partial downloads left by an interrupted process. A failed or cancelled download inside
 * one run already cleans up after itself; this catches the one case that cannot — the host dying
 * mid-transfer — so a leftover half-bundle never later looks configured.
 */
export async function discardStaleDownloads(bundleRoot: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(bundleRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await Promise.all(
    entries
      .filter((name) => name.startsWith('.partial-') || name.startsWith('.manifest-'))
      .map((name) => rm(path.join(bundleRoot, name), { recursive: true, force: true })),
  );
}

/**
 * Build the manifest the entry's own task's adapter reads, from the hashes actually on disk. The
 * download, hash check and cleanup above are shared; only the record differs, because each adapter
 * has its own shape. Recognition and synthesis share the one `BundleDescriptor`; translation is the
 * CT2/SentencePiece pair record; vision is the nested OCR/inpainting record. Writing the hash we
 * computed, never the catalogue's declared one, is what makes the manifest evidence of what landed.
 */
function buildManifest(
  model: CatalogueModel,
  directory: string,
  hashes: ReadonlyMap<string, string>,
): Record<string, unknown> {
  switch (model.task) {
    case 'recognition':
    case 'synthesis':
      return {
        engine: model.engine,
        directory,
        languages: [...model.languages],
        files: Object.fromEntries(hashes),
      };
    case 'translation':
      // The worker's `TranslationRegistry` requires exactly these keys — no version field.
      return {
        engine: model.engine,
        directory,
        source_language: model.source_language,
        target_language: model.target_language,
        files: Object.fromEntries(hashes),
      };
    case 'vision': {
      const artifact = (name: string) => ({
        path: path.join(directory, name),
        sha256: hashes.get(name),
      });
      const manifest: Record<string, unknown> = {};
      if (model.ocr) {
        manifest.ocr = Object.fromEntries(
          Object.entries(model.ocr).map(([language, pack]) => [
            language,
            {
              det: artifact(pack.det),
              rec: artifact(pack.rec),
              keys: artifact(pack.keys),
              det_version: pack.det_version,
              rec_version: pack.rec_version,
              rec_height: pack.rec_height,
            },
          ]),
        );
      }
      if (model.inpainting) manifest.inpainting = { model: artifact(model.inpainting.model) };
      return manifest;
    }
  }
}

/**
 * Download one offered model from its declared source host, verify every file against the
 * catalogue's hashes, and write the normal hand-preparable manifest recording the hashes actually
 * on disk. Downloading is another way to obtain a bundle, never a second bundle contract: the
 * caller points the existing configuration transaction at the written manifest, which the worker
 * hash-verifies again.
 *
 * Runs only in the host process. Nothing here ever reaches the inference child, whose audit hook
 * keeps denying every socket.
 */
export async function installOfferedModel(options: InstallOptions): Promise<InstallResult> {
  const { model, bundleRoot, signal, onProgress } = options;
  const download = options.download ?? defaultDownload;
  const freeSpace = options.freeSpace ?? defaultFreeSpace;
  const base = options.baseUrl ?? `https://${model.source_host}`;

  await mkdir(bundleRoot, { recursive: true });
  await discardStaleDownloads(bundleRoot);

  const free = await freeSpace(bundleRoot);
  if (free < model.download_size + model.on_disk_size) throw new RemoteError('SPEECH_DISK_LOW');

  const finalDirectory = path.join(bundleRoot, model.id);
  const finalManifest = manifestPath(bundleRoot, model.id);
  const temporary = path.join(bundleRoot, `.partial-${model.id}-${randomUUID()}`);
  const hashes = new Map<string, string>();
  let moved = false;
  let installed = false;

  try {
    await mkdir(temporary);
    let completed = 0;
    for (const file of model.files) {
      assertActive(signal);
      const response = await download(fileUrl(base, file.path), { signal });
      if (!response.ok || !response.body) throw new RemoteError('MODEL_DOWNLOAD_FAILED');
      const hash = createHash('sha256');
      let received = 0;
      const metering = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          received += chunk.length;
          completed += chunk.length;
          onProgress?.({
            phase: 'downloading',
            fraction: model.download_size > 0 ? Math.min(1, completed / model.download_size) : null,
          });
          callback(null, chunk);
        },
      });
      const destination = path.join(temporary, file.name);
      // A bundle may keep files in nested folders (`onnx/…`, `codec/…`); the name validator
      // already refuses traversal, so this only creates directories inside the partial bundle.
      await mkdir(path.dirname(destination), { recursive: true });
      await pipeline(
        Readable.from(response.body),
        metering,
        createWriteStream(destination, { flags: 'wx' }),
      );
      onProgress?.({ phase: 'verifying', fraction: null });
      const actual = hash.digest('hex');
      if (received !== file.size || actual !== file.sha256) {
        throw new RemoteError('MODEL_HASH_MISMATCH');
      }
      hashes.set(file.name, actual);
    }

    onProgress?.({ phase: 'installing', fraction: null });
    assertActive(signal);
    await rm(finalDirectory, { recursive: true, force: true });
    await rename(temporary, finalDirectory);
    moved = true;

    const manifest = buildManifest(model, finalDirectory, hashes);
    const pendingManifest = path.join(bundleRoot, `.manifest-${model.id}-${randomUUID()}.tmp`);
    try {
      await writeFile(pendingManifest, JSON.stringify(manifest, null, 2), 'utf8');
      await rename(pendingManifest, finalManifest);
    } catch (error) {
      await rm(pendingManifest, { force: true });
      throw error;
    }
    installed = true;
    return { manifest_path: finalManifest, directory: finalDirectory, engine: model.engine };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    if (moved && !installed) await rm(finalDirectory, { recursive: true, force: true });
    if (signal?.aborted) throw new RemoteError('CANCELLED');
    throw error;
  }
}
