import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  discardStalePacks,
  installedPackDirectory,
  installRuntimePack,
  type PackProgress,
  packIsInstalled,
  uninstallRuntimePack,
} from '../../../core/speech/pack-installer.js';
import {
  currentRuntimePackPlatform,
  findRuntimePack,
  packForEngine,
  parseRuntimePackManifest,
  type RuntimePackEntry,
  type RuntimePackManifest,
} from '../../../core/speech/runtime-packs.js';

export interface RuntimePackHost {
  repo: string;
  userData: string;
  platform: NodeJS.Platform;
  arch: string;
}

/** The host seam the offered-model flow uses to attach opt-in runtimes. */
export interface RuntimePackSupport {
  readonly manifest: RuntimePackManifest;
  entryFor(engine: string): RuntimePackEntry | null;
  isInstalled(entry: RuntimePackEntry): Promise<boolean>;
  install(
    entry: RuntimePackEntry,
    signal: AbortSignal,
    onProgress: (progress: PackProgress) => void,
  ): Promise<void>;
  uninstall(entry: RuntimePackEntry): Promise<void>;
  /** Worker import-path candidates; a directory may not exist until its pack is installed. */
  searchDirectories(): string[];
}

// The manifest is generated at build time and gitignored; a missing file means a dev checkout
// without locally staged packs, not a broken install.
export async function loadRuntimePackManifest(repo: string): Promise<RuntimePackManifest> {
  const file = path.join(repo, 'app', 'core', 'speech', 'runtime-packs.json');
  try {
    return parseRuntimePackManifest(JSON.parse(await readFile(file, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { packs: [] };
    throw error;
  }
}

export function createRuntimePackSupport(
  host: RuntimePackHost,
  manifest: RuntimePackManifest,
): RuntimePackSupport {
  const packRoot = path.join(host.userData, 'runtime-packs');
  const stagingRoot = path.join(host.repo, 'python', 'runtime-packs');
  const platform = currentRuntimePackPlatform(host.platform, host.arch);
  void discardStalePacks(packRoot).catch(() => undefined);

  return {
    manifest,
    entryFor: (engine) => {
      const name = packForEngine(engine);
      return name ? findRuntimePack(manifest, name, platform) : null;
    },
    isInstalled: async (entry) =>
      (await packIsInstalled(packRoot, entry.name, entry.version)) ||
      (await packIsInstalled(stagingRoot, entry.name, entry.version)),
    install: async (entry, signal, onProgress) => {
      await installRuntimePack({ entry, packRoot, signal, onProgress });
    },
    uninstall: async (entry) => {
      await uninstallRuntimePack(packRoot, entry.name, entry.version);
    },
    searchDirectories: () =>
      manifest.packs
        .filter((pack) => pack.platform === platform)
        .flatMap((pack) => [
          installedPackDirectory(packRoot, pack.name, pack.version),
          installedPackDirectory(stagingRoot, pack.name, pack.version),
        ]),
  };
}
