import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { type Composition, parseComposition } from '../editing/composition/document.js';
import { parseSoundtrack, type Soundtrack } from '../editing/soundtrack.js';
import { protectSources } from '../media/files.js';
import { type ProcessingRecipe, parseProcessingRecipe } from '../processing/recipe.js';
import { assertCues, type Cue } from '../subtitles/cues.js';
import { parseTextLayers, type TextLayers } from '../subtitles/layers/document.js';
import { validateProjectTimeline } from './editor-timeline.js';

const MAX_BYTES = 2 * 1024 * 1024;
export interface EditorSnapshot {
  text_layers?: TextLayers;
  composition?: Composition;
  soundtrack?: Soundtrack;
  processing?: ProcessingRecipe;
  cues: Cue[];
  sample: { start_ms: number; end_ms: number };
}
export interface ProjectFile extends EditorSnapshot {
  format: 'reupmatic.project';
  version: 5;
  source: { path: string; sha256: string };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

export function assertEditorSnapshot(value: unknown): asserts value is EditorSnapshot {
  if (
    !object(value) ||
    !onlyKeys(value, [
      'cues',
      'sample',
      ...('processing' in value ? ['processing'] : []),
      ...('soundtrack' in value ? ['soundtrack'] : []),
      ...('composition' in value ? ['composition'] : []),
      ...('text_layers' in value ? ['text_layers'] : []),
    ])
  )
    throw new Error('INVALID_PROJECT');
  assertCues(value.cues);
  if ('text_layers' in value) parseTextLayers(value.text_layers);
  if ('composition' in value) parseComposition(value.composition);
  if ('soundtrack' in value) parseSoundtrack(value.soundtrack);
  if ('processing' in value) {
    try {
      parseProcessingRecipe(value.processing, value.cues.length > 0);
    } catch {
      throw new Error('INVALID_PROJECT');
    }
  }
  const sample = value.sample;
  if (
    !object(sample) ||
    !onlyKeys(sample, ['start_ms', 'end_ms']) ||
    !Number.isInteger(sample.start_ms) ||
    !Number.isInteger(sample.end_ms) ||
    Number(sample.start_ms) < 0 ||
    Number(sample.end_ms) <= Number(sample.start_ms) ||
    Number(sample.end_ms) > 86400000
  )
    throw new Error('INVALID_PROJECT');
  if ('composition' in value) validateProjectTimeline(value as unknown as EditorSnapshot, 0);
}

export function parseProject(value: unknown): ProjectFile {
  if (!object(value) || value.format !== 'reupmatic.project') throw new Error('INVALID_PROJECT');
  if (value.version !== 5) throw new Error('PROJECT_VERSION');
  if (
    !onlyKeys(value, [
      'format',
      'version',
      'source',
      'cues',
      'sample',
      ...('processing' in value ? ['processing'] : []),
      ...('soundtrack' in value ? ['soundtrack'] : []),
      ...('composition' in value ? ['composition'] : []),
      ...('text_layers' in value ? ['text_layers'] : []),
    ])
  ) {
    throw new Error('INVALID_PROJECT');
  }
  const source = value.source;
  if (
    !object(source) ||
    !onlyKeys(source, ['path', 'sha256']) ||
    typeof source.path !== 'string' ||
    !source.path ||
    source.path.length > 4096 ||
    source.path.includes('\0') ||
    /^[a-z]+:\/\//i.test(source.path) ||
    typeof source.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(source.sha256)
  ) {
    throw new Error('INVALID_PROJECT');
  }
  assertEditorSnapshot({
    cues: value.cues,
    sample: value.sample,
    ...('processing' in value ? { processing: value.processing } : {}),
    ...('soundtrack' in value ? { soundtrack: value.soundtrack } : {}),
    ...('composition' in value ? { composition: value.composition } : {}),
    ...('text_layers' in value ? { text_layers: value.text_layers } : {}),
  });
  // Strictly data: no script, executable, remote URL, account, or model request.
  return structuredClone(value) as unknown as ProjectFile;
}

export function createProject(source: ProjectFile['source'], value: unknown): ProjectFile {
  assertEditorSnapshot(value);
  return parseProject({ format: 'reupmatic.project', version: 5, source, ...value });
}

export async function loadProject(filename: string): Promise<ProjectFile> {
  const handle = await open(filename, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_BYTES) throw new Error('PROJECT_TOO_LARGE');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const result = await handle.read(buffer, offset, buffer.length - offset, null);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    if (offset > MAX_BYTES) throw new Error('PROJECT_TOO_LARGE');
    let value: unknown;
    try {
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset)),
      );
    } catch {
      throw new Error('INVALID_PROJECT');
    }
    return parseProject(value);
  } finally {
    await handle.close();
  }
}

export async function saveProject(
  filename: string,
  project: ProjectFile,
  protectedSources: Iterable<string> = [],
): Promise<void> {
  const valid = parseProject(project);
  if (!filename.toLowerCase().endsWith('.reupmatic.json')) throw new Error('PROJECT_EXTENSION');
  const data = Buffer.from(`${JSON.stringify(valid, null, 2)}\n`, 'utf8');
  if (data.byteLength > MAX_BYTES) throw new Error('PROJECT_TOO_LARGE');
  const sources = [
    ...protectedSources,
    valid.source.path,
    ...(valid.soundtrack ? [valid.soundtrack.source.path] : []),
    ...(valid.composition?.clips.map((clip) => clip.source.path) ?? []),
  ];
  await protectSources(filename, sources);
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${randomUUID()}.tmp`,
  );
  let published = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(data);
      await file.sync();
    } finally {
      await file.close();
    }
    // Recheck after writing the temporary; do not unlink an old project first.
    await protectSources(filename, sources);
    await rename(temporary, filename);
    published = true;
  } finally {
    if (!published) await unlink(temporary).catch(() => undefined);
  }
}
