import { RemoteError } from '../worker/remote-error.js';

/** Runtime packs are the opt-in engine runtimes the base bundle does not carry. */
export const RUNTIME_PACK_NAMES = ['vision', 'synthesis'] as const;
export type RuntimePackName = (typeof RUNTIME_PACK_NAMES)[number];

export const RUNTIME_PACK_PLATFORMS = ['darwin-arm64', 'darwin-x64', 'win32-x64'] as const;
export type RuntimePackPlatform = (typeof RUNTIME_PACK_PLATFORMS)[number];

export interface RuntimePackEntry {
  readonly name: RuntimePackName;
  readonly version: string;
  readonly platform: RuntimePackPlatform;
  readonly url: string;
  readonly sha256: string;
  readonly size: number;
}

export interface RuntimePackManifest {
  readonly packs: RuntimePackEntry[];
}

const ENTRY_KEYS = ['name', 'version', 'platform', 'url', 'sha256', 'size'] as const;
const MAX_PACKS = 32;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function hashed(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

// The manifest is embedded in the signed app, so it is trusted input; still parse strictly so a
// hand-edited dev file fails loudly instead of installing the wrong thing.
export function parseRuntimePackManifest(value: unknown): RuntimePackManifest {
  if (!plain(value) || !exact(value, ['packs']) || !Array.isArray(value.packs)) {
    throw new RemoteError('RUNTIME_PACK_MANIFEST_INVALID');
  }
  if (value.packs.length > MAX_PACKS) throw new RemoteError('RUNTIME_PACK_MANIFEST_INVALID');
  const packs: RuntimePackEntry[] = [];
  const seen = new Set<string>();
  for (const entry of value.packs) {
    if (
      !plain(entry) ||
      !exact(entry, ENTRY_KEYS) ||
      typeof entry.name !== 'string' ||
      !(RUNTIME_PACK_NAMES as readonly string[]).includes(entry.name) ||
      typeof entry.version !== 'string' ||
      entry.version.length < 1 ||
      entry.version.length > 64 ||
      /[^A-Za-z0-9._-]/.test(entry.version) ||
      typeof entry.platform !== 'string' ||
      !(RUNTIME_PACK_PLATFORMS as readonly string[]).includes(entry.platform) ||
      typeof entry.url !== 'string' ||
      !entry.url.startsWith('https://') ||
      entry.url.length > 2048 ||
      !hashed(entry.sha256) ||
      !Number.isInteger(entry.size) ||
      (entry.size as number) < 1 ||
      (entry.size as number) > 4 * 1024 ** 3
    ) {
      throw new RemoteError('RUNTIME_PACK_MANIFEST_INVALID');
    }
    const key = `${entry.name}:${entry.platform}`;
    if (seen.has(key)) throw new RemoteError('RUNTIME_PACK_MANIFEST_INVALID');
    seen.add(key);
    packs.push({
      name: entry.name as RuntimePackName,
      version: entry.version,
      platform: entry.platform as RuntimePackPlatform,
      url: entry.url,
      sha256: entry.sha256,
      size: entry.size as number,
    });
  }
  return { packs };
}

export function currentRuntimePackPlatform(
  platform: NodeJS.Platform,
  arch: string,
): RuntimePackPlatform | null {
  const key = `${platform}-${arch}`;
  return (RUNTIME_PACK_PLATFORMS as readonly string[]).includes(key)
    ? (key as RuntimePackPlatform)
    : null;
}

export function findRuntimePack(
  manifest: RuntimePackManifest,
  name: RuntimePackName,
  platform: RuntimePackPlatform | null,
): RuntimePackEntry | null {
  if (!platform) return null;
  return manifest.packs.find((pack) => pack.name === name && pack.platform === platform) ?? null;
}

// Must stay in sync with ARCHITECTURES_BY_TASK in model-catalogue.ts.
export function packForEngine(engine: string): RuntimePackName | null {
  switch (engine) {
    case 'vieneu-v3-nano-onnx':
    case 'vieneu-v3-turbo-onnx':
    case 'vieneu-v3-turbo-clone-onnx':
      return 'synthesis';
    case 'rapidocr-lama':
      return 'vision';
    default:
      return null;
  }
}
