import { validateProjectTimeline } from '../../projects/editor-timeline.js';
import type { EditorSnapshot } from '../../projects/project.js';
import {
  SHIPPED_VOICE_TIMING_POLICY,
  type VoiceTimingLine,
} from '../../speech/synthesis/timing.js';
import { parseVoiceTrack, type VoiceTrack } from '../../speech/synthesis/voice-track.js';
import { assertCues, type Cue } from '../../subtitles/cues.js';
import {
  getTextLayer,
  parseTextLayers,
  sameText,
  textLayerNames,
} from '../../subtitles/layers/document.js';
import { type CompositionCommand, editComposition } from './commands.js';
import { remapCompositionCues } from './cue-mapping.js';
import { type Composition, compositionDuration, parseComposition } from './document.js';

interface MappedSpan {
  start_ms: number;
  end_ms: number;
}

const MAX_TIME_MS = 86400000;

function contiguousSpan(cues: Cue[]): MappedSpan | null {
  if (!cues.length) return null;
  const ordered = [...cues].sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);
  let { start_ms, end_ms } = ordered[0];
  for (const cue of ordered.slice(1)) {
    if (cue.start_ms !== end_ms) return null;
    end_ms = Math.max(end_ms, cue.end_ms);
  }
  return { start_ms, end_ms };
}

// Rates are never recomputed; an edit that changes a slot marks the track stale.
export function remapCompositionVoice(
  before: Composition,
  after: Composition,
  track: VoiceTrack,
  ancestry: Map<string, string[]> = new Map(),
): VoiceTrack {
  const planned = track.plan.lines;
  if (!planned.length) return track;
  const probes: Cue[] = [];
  planned.forEach((line, index) => {
    probes.push({
      id: `voice-anchor-${index}`,
      start_ms: line.offset_ms,
      end_ms: Math.min(MAX_TIME_MS, line.offset_ms + 8),
      text: line.cue_id,
    });
    probes.push({
      id: `voice-span-${index}`,
      start_ms: line.offset_ms,
      end_ms: Math.min(MAX_TIME_MS, line.offset_ms + Math.max(1, line.slot_ms)),
      text: line.cue_id,
    });
  });
  const anchors = new Map<number, Cue[]>(),
    spans = new Map<number, Cue[]>();
  for (const cue of remapCompositionCues(before, after, probes, ancestry)) {
    const match = /^voice-(anchor|span)-(\d+)(?:~\d+)?$/.exec(cue.id);
    if (!match) continue;
    const bucket = match[1] === 'anchor' ? anchors : spans,
      index = Number(match[2]);
    bucket.set(index, [...(bucket.get(index) ?? []), cue]);
  }
  const carried: Array<{ line: VoiceTimingLine; start_ms: number; end_ms: number | null }> = [];
  let dropped = false;
  planned.forEach((line, index) => {
    const anchor = contiguousSpan(anchors.get(index) ?? []),
      span = contiguousSpan(spans.get(index) ?? []);
    if (!anchor) {
      dropped = true;
      return;
    }
    carried.push({ line, start_ms: anchor.start_ms, end_ms: span?.end_ms ?? null });
  });
  carried.sort((a, b) => a.start_ms - b.start_ms || a.line.cue_id.localeCompare(b.line.cue_id));
  let stale = track.stale || dropped;
  const lines: VoiceTimingLine[] = carried.map((entry, position) => {
    const next = carried[position + 1];
    const slot_ms = next
      ? next.start_ms - entry.start_ms
      : Math.max(0, (entry.end_ms ?? entry.start_ms) - entry.start_ms);
    if (slot_ms !== entry.line.slot_ms) stale = true;
    const overrun_ms = track.plan.engine_targets_duration
      ? Math.max(0, entry.line.speech_ms - slot_ms)
      : Math.max(0, Math.floor(entry.line.speech_ms / entry.line.rate - slot_ms));
    return {
      cue_id: entry.line.cue_id,
      offset_ms: entry.start_ms,
      rate: entry.line.rate,
      slot_ms,
      speech_ms: entry.line.speech_ms,
      overrun_ms,
    };
  });
  const kept = new Set(lines.map((line) => line.cue_id));
  let previousEnd = 0;
  const segments = track.segments
    .filter((segment) => kept.has(segment.cue_id))
    .map((segment) => {
      const bridged = { ...segment, lead_silence_frames: segment.start_frame - previousEnd };
      previousEnd = segment.end_frame;
      return bridged;
    });
  return parseVoiceTrack({
    ...structuredClone(track),
    plan: {
      engine_targets_duration: track.plan.engine_targets_duration,
      lines,
      conflicts: lines.filter(
        (line) => line.overrun_ms > SHIPPED_VOICE_TIMING_POLICY.acceptable_overrun_ms,
      ),
    },
    segments,
    stale,
  });
}

export function compositionSnapshot(
  snapshot: EditorSnapshot,
  value: Composition,
  cues: Cue[],
): EditorSnapshot {
  assertCues(cues);
  const composition = parseComposition(value),
    duration = compositionDuration(composition);
  const next = structuredClone({ ...snapshot, composition, cues });
  const clamp = (range: { start_ms: number; end_ms: number }) => ({
    start_ms: Math.max(0, Math.min(range.start_ms, duration - 1)),
    end_ms: Math.max(1, Math.min(range.end_ms, duration)),
  });
  if (next.processing?.editing?.trim)
    next.processing.editing.trim = clamp(next.processing.editing.trim);
  validateProjectTimeline(next, duration);
  return next;
}

export function editCompositionSnapshot(
  snapshot: EditorSnapshot,
  commands: CompositionCommand[],
): EditorSnapshot {
  if (!snapshot.composition) throw new Error('INVALID_COMPOSITION');
  let composition = snapshot.composition;
  let next = structuredClone(snapshot);
  for (const command of commands) {
    const before = next;
    const edited = editComposition(composition, before.cues, command);
    let layers = before.text_layers ? structuredClone(before.text_layers) : undefined;
    if (layers) {
      for (const name of textLayerNames) {
        const old = getTextLayer(before, name);
        const cues =
          name === 'displayed' ? edited.cues : editComposition(composition, old.cues, command).cues;
        if (!sameText(old.cues, cues)) layers[name].token = crypto.randomUUID();
        if (name !== 'displayed') layers[name].cues = cues;
      }
      for (const name of textLayerNames) {
        const origin = layers[name].origin;
        if (
          (origin.kind === 'copy' || origin.kind === 'translation') &&
          origin.token === before.text_layers?.[origin.layer].token
        ) {
          origin.token = layers[origin.layer].token;
        }
      }
      layers = parseTextLayers(layers);
    }
    let voice = before.voice_track;
    if (voice) {
      voice = remapCompositionVoice(composition, edited.composition, voice, edited.ancestry);
      if (
        layers &&
        voice.origin.kind === 'copy' &&
        voice.origin.token === before.text_layers?.[voice.origin.layer].token
      ) {
        voice = { ...voice, origin: { ...voice.origin, token: layers[voice.origin.layer].token } };
      }
    }
    next = compositionSnapshot(
      {
        ...before,
        ...(layers ? { text_layers: layers } : {}),
        ...(voice ? { voice_track: voice } : {}),
      },
      edited.composition,
      edited.cues,
    );
    composition = edited.composition;
  }
  return next;
}
