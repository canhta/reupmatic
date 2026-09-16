/** Ordered hard cuts. Clip ranges use source time; the montage uses a gapless clock. */
export interface ClipSource {
  path: string;
  name: string;
  sha256: string;
  duration_ms: number;
}
export interface CompositionClip {
  id: string;
  source: ClipSource;
  start_ms: number;
  end_ms: number;
  speed: number;
}
export interface Composition {
  version: 1;
  canvas: { width: number; height: number; fps: 30 };
  clips: CompositionClip[];
}
export interface ClipSpan { clip: CompositionClip; start_ms: number; end_ms: number }
export const MAX_CLIPS = 64;
const MAX_TIME = 86400000;

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) {
    throw new Error('INVALID_COMPOSITION');
  }
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isInteger(value))) throw new Error('INVALID_COMPOSITION');
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value || value.length > max || value.includes('\0')) throw new Error('INVALID_COMPOSITION');
  return value;
}
export function parseClip(value: unknown): CompositionClip {
  const input = record(value, ['id', 'source', 'start_ms', 'end_ms', 'speed']);
  const source = record(input.source, ['path', 'name', 'sha256', 'duration_ms']);
  const id = text(input.id, 128);
  const path = text(source.path, 4096);
  const sha256 = text(source.sha256, 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || /^[a-z]+:\/\//i.test(path) || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('INVALID_COMPOSITION');
  }
  const duration_ms = number(source.duration_ms, 1, MAX_TIME);
  const start_ms = number(input.start_ms, 0, duration_ms - 1);
  const end_ms = number(input.end_ms, start_ms + 1, duration_ms);
  const speed = number(input.speed, 0.25, 4, false);
  if (Math.round((end_ms - start_ms) / speed) < 100) throw new Error('COMPOSITION_CLIP_SHORT');
  return { id, source: { path, name: text(source.name, 512), sha256, duration_ms }, start_ms, end_ms, speed };
}
export function parseComposition(value: unknown): Composition {
  const input = record(value, ['version', 'canvas', 'clips']);
  const canvas = record(input.canvas, ['width', 'height', 'fps']);
  const width = number(canvas.width, 2, 4096), height = number(canvas.height, 2, 4096);
  if (input.version !== 1 || canvas.fps !== 30 || width % 2 || height % 2
    || !Array.isArray(input.clips) || !input.clips.length || input.clips.length > MAX_CLIPS) {
    throw new Error('INVALID_COMPOSITION');
  }
  const clips = input.clips.map(parseClip);
  if (new Set(clips.map(clip => clip.id)).size !== clips.length) throw new Error('INVALID_COMPOSITION');
  const result: Composition = { version: 1, canvas: { width, height, fps: 30 }, clips };
  if (compositionDuration(result) > MAX_TIME) throw new Error('COMPOSITION_DURATION');
  return result;
}
export function compositionSpans(value: Composition): ClipSpan[] {
  let offset = 0;
  return value.clips.map(clip => {
    const start_ms = offset;
    offset += Math.round((clip.end_ms - clip.start_ms) / clip.speed);
    return { clip, start_ms, end_ms: offset };
  });
}
export function compositionDuration(value: Composition): number {
  return value.clips.reduce((sum, clip) => sum + Math.round((clip.end_ms - clip.start_ms) / clip.speed), 0);
}
export function compositionPosition(value: Composition, milliseconds: number): { clip_id: string; source_ms: number } | null {
  const span = compositionSpans(value).find(item => milliseconds >= item.start_ms && milliseconds < item.end_ms);
  return span ? { clip_id: span.clip.id,
    source_ms: Math.min(span.clip.end_ms - 1, Math.round(span.clip.start_ms + (milliseconds - span.start_ms) * span.clip.speed)) } : null;
}
