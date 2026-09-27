import type { Cue, CueWord } from './cues.js';
import type { SubtitleStyle } from './style.js';

/**
 * Per-project line-length policy. `auto` derives the character budget from the real layout and the
 * reading speed from the script; `custom` uses the stored numbers where they are set.
 */
export interface LineLengthSettings {
  mode: 'auto' | 'custom';
  /** Characters per second; null follows the script default. */
  cps: number | null;
  max_lines: 1 | 2;
  /** Characters per cue; null derives it from the style and frame. */
  max_chars: number | null;
}
export const defaultLineLengthSettings: Readonly<LineLengthSettings> = Object.freeze({
  mode: 'auto',
  cps: null,
  max_lines: 2,
  max_chars: null,
});
export interface FrameSize {
  width: number;
  height: number;
}

/** Netflix timed-text guidance, used as the editable defaults. */
export const LATIN_CPS = 17;
export const CHINESE_CPS = 9;
/** Netflix guidance: a subtitle stays on screen for at least 5/6 s. */
export const MIN_ON_SCREEN_MS = 833;
/** Average glyph advance as a fraction of the em, per script, and the bold penalty. */
const LATIN_ADVANCE_EM = 0.5;
const CJK_ADVANCE_EM = 1;
const BOLD_ADVANCE_FACTOR = 1.05;
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\u3040-\u30FF]|[\u{20000}-\u{2FA1F}]/u;

function isCjk(character: string): boolean {
  return CJK.test(character);
}
function isCjkText(text: string): boolean {
  let cjk = 0;
  let other = 0;
  for (const character of text) {
    if (/\s/u.test(character)) continue;
    if (isCjk(character)) cjk++;
    else other++;
  }
  return cjk > other;
}
/** Reading and layout budgets count visible characters, not spaces. */
function characterCount(text: string): number {
  let count = 0;
  for (const character of text) if (!/\s/u.test(character)) count++;
  return count;
}

export interface LineLengthLimits {
  maxChars: number;
  cps: number;
  maxDuration_ms: number;
}

/** The character budget and the duration budget derived from reading speed, at least 5/6 s. */
export function lineLengthLimits(
  text: string,
  settings: LineLengthSettings,
  style: SubtitleStyle,
  frame: FrameSize,
): LineLengthLimits {
  const cjk = isCjkText(text);
  const cps = settings.cps ?? (cjk ? CHINESE_CPS : LATIN_CPS);
  if (!(cps > 0)) throw new Error('INVALID_LINE_LENGTH');
  const maxChars =
    settings.max_chars ??
    Math.max(
      1,
      Math.floor(
        (frame.width * (1 - (2 * style.margin_x_pct) / 100)) /
          ((frame.height * style.font_size_pct * (cjk ? CJK_ADVANCE_EM : LATIN_ADVANCE_EM)) / 100) /
          (style.bold ? BOLD_ADVANCE_FACTOR : 1) +
          1e-9,
      ) * settings.max_lines,
    );
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error('INVALID_LINE_LENGTH');
  return {
    maxChars,
    cps,
    maxDuration_ms: Math.max(MIN_ON_SCREEN_MS, Math.round((1000 * maxChars) / cps)),
  };
}

export interface SplitPiece {
  text: string;
  start_ms: number;
  end_ms: number;
  words: CueWord[];
}

function piece(words: CueWord[]): SplitPiece {
  return {
    text: words.map((word) => word.text).join(''),
    start_ms: words[0].start_ms,
    end_ms: words[words.length - 1].end_ms,
    words: words.map((word) => ({ ...word })),
  };
}

/**
 * Splits measured word timings into readable cues. Words close a cue when the next one would
 * exceed the character budget or run the cue past the reading-speed duration. A single word that
 * alone exceeds a limit still becomes its own cue.
 */
export function splitCues(
  words: CueWord[],
  settings: LineLengthSettings,
  style: SubtitleStyle,
  frame: FrameSize,
): SplitPiece[] {
  if (!Array.isArray(words) || words.length === 0) throw new Error('INVALID_CUES');
  const limits = lineLengthLimits(words.map((word) => word.text).join(''), settings, style, frame);
  const pieces: SplitPiece[] = [];
  let tokens: CueWord[] = [];
  const flush = () => {
    if (tokens.length) pieces.push(piece(tokens));
    tokens = [];
  };
  for (const word of words) {
    if (tokens.length) {
      const chars = characterCount([...tokens, word].map((token) => token.text).join(''));
      const span = word.end_ms - tokens[0].start_ms;
      if (chars > limits.maxChars || span > limits.maxDuration_ms) flush();
    }
    tokens.push(word);
  }
  flush();
  return pieces;
}

/** Re-splits one cue; a cue that already fits keeps its window and measured words unchanged. */
export function splitCue(
  cue: Cue,
  settings: LineLengthSettings,
  style: SubtitleStyle,
  frame: FrameSize,
): SplitPiece[] {
  if (!cue.words?.length)
    return [{ text: cue.text, start_ms: cue.start_ms, end_ms: cue.end_ms, words: [] }];
  const pieces = splitCues(cue.words, settings, style, frame);
  return pieces.length > 1
    ? pieces
    : [
        {
          text: cue.text,
          start_ms: cue.start_ms,
          end_ms: cue.end_ms,
          words: structuredClone(cue.words),
        },
      ];
}
