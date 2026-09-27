import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { open, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { type Composition, parseComposition } from '../editing/composition/document.js';
import { type ProjectMedia, parseProjectMedia } from '../editing/project-media.js';
import { parseSoundtrack, type Soundtrack } from '../editing/soundtrack.js';
import { protectSources } from '../media/files.js';
import { type ProcessingRecipe, parseProcessingRecipe } from '../processing/recipe.js';
import { parseVoiceTrack, type VoiceTrack } from '../speech/synthesis/voice-track.js';
import { assertCues, type Cue } from '../subtitles/cues.js';
import { isBundledFontFamily } from '../subtitles/fonts.js';
import { parseTextLayers, type TextLayers } from '../subtitles/layers/document.js';
import { type LineLengthSettings, parseLineLengthSettings } from '../subtitles/split.js';
import { parseSubtitleStyle } from '../subtitles/style.js';
import { validateProjectTimeline } from './editor-timeline.js';

const MAX_BYTES = 2 * 1024 * 1024;
export interface EditorSnapshot {
  name?: string;
  text_layers?: TextLayers;
  line_length?: LineLengthSettings;
  composition?: Composition;
  soundtrack?: Soundtrack;
  voice_track?: VoiceTrack;
  processing?: ProcessingRecipe;
  media?: ProjectMedia[];
  cues: Cue[];
}
export interface ProjectFile extends EditorSnapshot {
  format: 'reupmatic.project';
  name: string;
  source: { path: string; sha256: string };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
export function defaultProjectName(sourcePath: string): string {
  return path.parse(sourcePath).name || 'Untitled project';
}
function projectName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 200 ||
    value.includes('\0') ||
    /[\r\n]/.test(value)
  ) {
    throw new Error('INVALID_PROJECT');
  }
  return value;
}

function unsupportedProjectFont(processing: unknown): boolean {
  if (!object(processing) || !('subtitle_style' in processing)) return false;
  const style = processing.subtitle_style;
  if (!object(style) || !('font_family' in style)) return false;
  return typeof style.font_family !== 'string' || !isBundledFontFamily(style.font_family);
}

export function assertEditorSnapshot(value: unknown): asserts value is EditorSnapshot {
  if (
    !object(value) ||
    !onlyKeys(value, [
      'cues',
      ...('name' in value ? ['name'] : []),
      ...('processing' in value ? ['processing'] : []),
      ...('soundtrack' in value ? ['soundtrack'] : []),
      ...('composition' in value ? ['composition'] : []),
      ...('text_layers' in value ? ['text_layers'] : []),
      ...('line_length' in value ? ['line_length'] : []),
      ...('voice_track' in value ? ['voice_track'] : []),
      ...('media' in value ? ['media'] : []),
    ])
  )
    throw new Error('INVALID_PROJECT');
  if ('name' in value) projectName(value.name);
  assertCues(value.cues);
  if ('line_length' in value) parseLineLengthSettings(value.line_length);
  if ('media' in value) parseProjectMedia(value.media);
  if ('text_layers' in value) parseTextLayers(value.text_layers);
  if ('composition' in value) parseComposition(value.composition);
  if ('soundtrack' in value) parseSoundtrack(value.soundtrack);
  if ('voice_track' in value) parseVoiceTrack(value.voice_track);
  if ('processing' in value) {
    try {
      parseProcessingRecipe(value.processing, value.cues.length > 0);
    } catch {
      // Name the actual cause instead of collapsing every recipe failure into INVALID_PROJECT.
      if (unsupportedProjectFont(value.processing)) throw new Error('PROJECT_FONT_UNSUPPORTED');
      throw new Error('INVALID_PROJECT');
    }
  }
  if ('composition' in value) validateProjectTimeline(value as unknown as EditorSnapshot, 0);
}

export function parseProject(value: unknown): ProjectFile {
  if (!object(value) || value.format !== 'reupmatic.project') throw new Error('INVALID_PROJECT');
  if (
    !onlyKeys(value, [
      'format',
      'source',
      'name',
      'cues',
      ...('processing' in value ? ['processing'] : []),
      ...('soundtrack' in value ? ['soundtrack'] : []),
      ...('composition' in value ? ['composition'] : []),
      ...('text_layers' in value ? ['text_layers'] : []),
      ...('line_length' in value ? ['line_length'] : []),
      ...('voice_track' in value ? ['voice_track'] : []),
      ...('media' in value ? ['media'] : []),
    ])
  ) {
    throw new Error('INVALID_PROJECT');
  }
  const name = projectName(value.name);
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
    name,
    cues: value.cues,
    ...('processing' in value ? { processing: value.processing } : {}),
    ...('soundtrack' in value ? { soundtrack: value.soundtrack } : {}),
    ...('composition' in value ? { composition: value.composition } : {}),
    ...('text_layers' in value ? { text_layers: value.text_layers } : {}),
    ...('line_length' in value ? { line_length: value.line_length } : {}),
    ...('voice_track' in value ? { voice_track: value.voice_track } : {}),
    ...('media' in value ? { media: value.media } : {}),
  });
  // Rebuild from the parsers so accepted values are normalised (trimmed, upper-cased, clamped),
  // not the raw JSON. Strictly data: no script, executable, URL, account or model request.
  const cues = (value.cues as Cue[]).map((cue) => {
    const copy = structuredClone(cue);
    if (copy.style) copy.style = parseSubtitleStyle(copy.style);
    return copy;
  });
  return {
    format: 'reupmatic.project',
    name,
    source: { path: source.path, sha256: source.sha256 },
    cues,
    ...('processing' in value
      ? { processing: parseProcessingRecipe(value.processing, cues.length > 0) }
      : {}),
    ...('soundtrack' in value ? { soundtrack: parseSoundtrack(value.soundtrack) } : {}),
    ...('composition' in value ? { composition: parseComposition(value.composition) } : {}),
    ...('text_layers' in value ? { text_layers: parseTextLayers(value.text_layers) } : {}),
    ...('line_length' in value ? { line_length: parseLineLengthSettings(value.line_length) } : {}),
    ...('voice_track' in value ? { voice_track: parseVoiceTrack(value.voice_track) } : {}),
    ...('media' in value ? { media: parseProjectMedia(value.media) } : {}),
  };
}

export function createProject(source: ProjectFile['source'], value: unknown): ProjectFile {
  const snapshot = object(value)
    ? typeof value.name === 'string' && value.name
      ? value
      : { ...value, name: defaultProjectName(source.path) }
    : value;
  assertEditorSnapshot(snapshot);
  return parseProject({ format: 'reupmatic.project', source, ...snapshot });
}

/** The editor's view of a project: every field except the file envelope. */
export function projectSnapshot(project: ProjectFile): EditorSnapshot {
  const snapshot: EditorSnapshot = structuredClone(project);
  delete (snapshot as Partial<ProjectFile>).format;
  delete (snapshot as Partial<ProjectFile>).source;
  return snapshot;
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

const PROJECT_SUFFIX = '.reupmatic.json';

/** A chosen save name always lands on the one supported project extension. */
export function normalizeProjectFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(PROJECT_SUFFIX)) return filename;
  if (lower.endsWith('.json')) return `${filename.slice(0, -'.json'.length)}${PROJECT_SUFFIX}`;
  return `${filename}${PROJECT_SUFFIX}`;
}

/** Only paths the host resolved itself may be written; the renderer never names a destination. */
export function authorizedProjectPath(value: unknown, known: ReadonlySet<string>): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
    throw new Error('INVALID_REQUEST');
  const resolved = path.resolve(value);
  if (!known.has(resolved)) throw new Error('PROJECT_PATH_UNAUTHORIZED');
  return resolved;
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
    ...(valid.media?.map((item) => item.path) ?? []),
  ];
  await protectSources(filename, sources);
  const directory = path.dirname(filename);
  const temporary = path.join(directory, `.${path.basename(filename)}.${randomUUID()}.tmp`);
  // A crash can orphan a previous write's temp file; a fresh save clears them.
  const stalePrefix = `.${path.basename(filename)}.`;
  for (const name of await readdir(directory).catch(() => [])) {
    if (name.startsWith(stalePrefix) && name.endsWith('.tmp'))
      await unlink(path.join(directory, name)).catch(() => undefined);
  }
  let published = false;
  try {
    const file = await open(temporary, 'wx', 0o644);
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
