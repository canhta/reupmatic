import { type TextLayerName, textLayerNames } from '../subtitles/layers/document.js';

export type ProjectMediaKind = 'video' | 'subtitle' | 'image';
export interface ProjectMedia {
  id: string;
  kind: ProjectMediaKind;
  path: string;
  name: string;
  sha256: string;
  duration_ms?: number;
  imported_layer?: TextLayerName;
}

export const MAX_PROJECT_MEDIA = 64;
const MAX_TIME = 86400000;

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
function text(value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > max ||
    value.includes('\0') ||
    /^[a-z]+:\/\//i.test(value)
  ) {
    throw new Error('INVALID_PROJECT');
  }
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value))
    throw new Error('INVALID_PROJECT');
  return value;
}
export function parseProjectMedia(value: unknown): ProjectMedia[] {
  if (!Array.isArray(value) || value.length > MAX_PROJECT_MEDIA) throw new Error('INVALID_PROJECT');
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('INVALID_PROJECT');
    const input = item as Record<string, unknown>;
    if (
      !onlyKeys(input, [
        'id',
        'kind',
        'path',
        'name',
        'sha256',
        ...(input.kind === 'video' ? ['duration_ms'] : []),
        ...(input.kind === 'subtitle' && 'imported_layer' in input ? ['imported_layer'] : []),
      ])
    )
      throw new Error('INVALID_PROJECT');
    const id = identifier(input.id);
    if (seen.has(id)) throw new Error('INVALID_PROJECT');
    seen.add(id);
    const path = text(input.path, 4096);
    const name = text(input.name, 512);
    const sha256 = text(input.sha256, 64);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('INVALID_PROJECT');
    if (input.kind === 'video') {
      if (
        typeof input.duration_ms !== 'number' ||
        !Number.isInteger(input.duration_ms) ||
        input.duration_ms < 1 ||
        input.duration_ms > MAX_TIME
      )
        throw new Error('INVALID_PROJECT');
      return { id, kind: 'video', path, name, sha256, duration_ms: input.duration_ms };
    }
    if (input.kind === 'image') return { id, kind: 'image', path, name, sha256 };
    if (input.kind !== 'subtitle') throw new Error('INVALID_PROJECT');
    if (
      'imported_layer' in input &&
      !textLayerNames.includes(input.imported_layer as TextLayerName)
    )
      throw new Error('INVALID_PROJECT');
    return {
      id,
      kind: 'subtitle',
      path,
      name,
      sha256,
      ...('imported_layer' in input
        ? { imported_layer: input.imported_layer as TextLayerName }
        : {}),
    };
  });
}
