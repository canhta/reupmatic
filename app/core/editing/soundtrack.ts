export interface AudioSource {
  path: string;
  name: string;
  sha256: string;
  duration_ms: number;
}
/** Lower the music while speech plays, keyed by the voice track when present and otherwise by
 *  the original audio. `amount_db` is the reduction at the documented reference speech level and
 *  `release_ms` is how quickly the music comes back once the speech stops. */
export interface SoundtrackDuck {
  enabled: boolean;
  amount_db: number;
  release_ms: number;
}
/** A newly picked soundtrack starts with ducking off; one producer of this value, used by every
 *  place that builds a fresh soundtrack rather than repeating the literal. */
export const DEFAULT_SOUNDTRACK_DUCK: SoundtrackDuck = {
  enabled: false,
  amount_db: 12,
  release_ms: 250,
};
export interface Soundtrack {
  source: AudioSource;
  mode: 'replace' | 'mix';
  start_ms: number;
  end_ms: number;
  offset_ms: number;
  gain_db: number;
  fade_in_ms: number;
  fade_out_ms: number;
  duck: SoundtrackDuck;
  /** The music lane is muted: the clip stays on the timeline but is silent in preview and export. */
  muted: boolean;
}

export function parseSoundtrack(value: unknown): Soundtrack {
  function object(input: unknown, keys: string[]): Record<string, unknown> {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length !== keys.length ||
      keys.some((key) => !(key in input))
    )
      throw new Error('INVALID_SOUNDTRACK');
    return input as Record<string, unknown>;
  }
  function number(input: unknown, min: number, max: number, integer = true): number {
    if (
      typeof input !== 'number' ||
      !Number.isFinite(input) ||
      input < min ||
      input > max ||
      (integer && !Number.isInteger(input))
    )
      throw new Error('INVALID_SOUNDTRACK');
    return input;
  }
  const input = object(value, [
    'source',
    'mode',
    'start_ms',
    'end_ms',
    'offset_ms',
    'gain_db',
    'fade_in_ms',
    'fade_out_ms',
    'duck',
    'muted',
  ]);
  const source = object(input.source, ['path', 'name', 'sha256', 'duration_ms']);
  if (
    typeof source.path !== 'string' ||
    source.path.length > 4096 ||
    source.path.includes('\0') ||
    !/^(\/|[a-z]:[\\/]|\\\\)/i.test(source.path) ||
    /^[a-z]+:\/\//i.test(source.path) ||
    typeof source.name !== 'string' ||
    !source.name ||
    source.name.length > 512 ||
    source.name.includes('\0') ||
    typeof source.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    (input.mode !== 'replace' && input.mode !== 'mix')
  )
    throw new Error('INVALID_SOUNDTRACK');
  const duration_ms = number(source.duration_ms, 1, 86400000);
  const start_ms = number(input.start_ms, 0, duration_ms - 1);
  const end_ms = number(input.end_ms, start_ms + 1, duration_ms);
  const fade_in_ms = number(input.fade_in_ms, 0, end_ms - start_ms);
  const fade_out_ms = number(input.fade_out_ms, 0, end_ms - start_ms - fade_in_ms);
  const duck = object(input.duck, ['enabled', 'amount_db', 'release_ms']);
  if (typeof duck.enabled !== 'boolean' || typeof input.muted !== 'boolean')
    throw new Error('INVALID_SOUNDTRACK');
  return {
    source: { path: source.path, name: source.name, sha256: source.sha256, duration_ms },
    mode: input.mode,
    start_ms,
    end_ms,
    fade_in_ms,
    fade_out_ms,
    offset_ms: number(input.offset_ms, 0, 86400000),
    gain_db: number(input.gain_db, -60, 24, false),
    duck: {
      enabled: duck.enabled,
      amount_db: number(duck.amount_db, 1, 24, false),
      release_ms: number(duck.release_ms, 10, 5000),
    },
    muted: input.muted,
  };
}
