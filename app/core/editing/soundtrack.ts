export interface AudioSource {
  path: string;
  name: string;
  sha256: string;
  duration_ms: number;
}
export interface Soundtrack {
  source: AudioSource;
  mode: 'replace' | 'mix';
  start_ms: number;
  end_ms: number;
  offset_ms: number;
  gain_db: number;
  fade_in_ms: number;
  fade_out_ms: number;
}

export function parseSoundtrack(value: unknown): Soundtrack {
  function object(input: unknown, keys: string[]): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== keys.length || keys.some(key => !(key in input))) throw new Error('INVALID_SOUNDTRACK');
    return input as Record<string, unknown>;
  }
  function number(input: unknown, min: number, max: number, integer = true): number {
    if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max
      || (integer && !Number.isInteger(input))) throw new Error('INVALID_SOUNDTRACK');
    return input;
  }
  const input = object(value, ['source', 'mode', 'start_ms', 'end_ms', 'offset_ms', 'gain_db', 'fade_in_ms', 'fade_out_ms']);
  const source = object(input.source, ['path', 'name', 'sha256', 'duration_ms']);
  if (typeof source.path !== 'string' || source.path.length > 4096 || source.path.includes('\0')
    || !/^(\/|[a-z]:[\\/]|\\\\)/i.test(source.path) || /^[a-z]+:\/\//i.test(source.path)
    || typeof source.name !== 'string' || !source.name || source.name.length > 512 || source.name.includes('\0')
    || typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256)
    || (input.mode !== 'replace' && input.mode !== 'mix')) throw new Error('INVALID_SOUNDTRACK');
  const duration_ms = number(source.duration_ms, 1, 86400000);
  const start_ms = number(input.start_ms, 0, duration_ms - 1);
  const end_ms = number(input.end_ms, start_ms + 1, duration_ms);
  const fade_in_ms = number(input.fade_in_ms, 0, end_ms - start_ms);
  const fade_out_ms = number(input.fade_out_ms, 0, end_ms - start_ms - fade_in_ms);
  return { source: { path: source.path, name: source.name, sha256: source.sha256, duration_ms },
    mode: input.mode, start_ms, end_ms, fade_in_ms, fade_out_ms,
    offset_ms: number(input.offset_ms, 0, 86400000), gain_db: number(input.gain_db, -60, 24, false) };
}
