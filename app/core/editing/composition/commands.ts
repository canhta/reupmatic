import type { Cue } from '../../subtitles/cues.js';
import { remapCompositionCues } from './cue-mapping.js';
import {
  type Composition,
  type CompositionClip,
  compositionSpans,
  parseComposition,
} from './document.js';

export type CompositionCommand =
  | { kind: 'append'; clip: CompositionClip }
  | { kind: 'insert'; index: number; clip: CompositionClip }
  | { kind: 'remove'; id: string }
  | { kind: 'move'; id: string; direction: -1 | 1 }
  | { kind: 'update'; id: string; start_ms: number; end_ms: number; speed: number }
  | { kind: 'enable'; id: string; enabled: boolean }
  | { kind: 'split'; id: string; at_ms: number; new_id: string }
  | { kind: 'join'; id: string };

export function editComposition(value: Composition, cues: Cue[], command: CompositionCommand) {
  const before = parseComposition(value),
    next = structuredClone(before);
  const ancestry = new Map<string, string[]>();
  if (command.kind === 'append') next.clips.push(structuredClone(command.clip));
  else if (command.kind === 'insert') {
    if (!Number.isInteger(command.index) || command.index < 0 || command.index > next.clips.length)
      throw new Error('INVALID_COMPOSITION');
    next.clips.splice(command.index, 0, structuredClone(command.clip));
  } else {
    const index = next.clips.findIndex((clip) => clip.id === command.id);
    if (index < 0) throw new Error('INVALID_COMPOSITION');
    const clip = next.clips[index];
    switch (command.kind) {
      case 'remove':
        next.clips.splice(index, 1);
        break;
      case 'move': {
        const target = index + command.direction;
        if (![1, -1].includes(command.direction) || target < 0 || target >= next.clips.length)
          throw new Error('INVALID_COMPOSITION');
        [next.clips[index], next.clips[target]] = [next.clips[target], clip];
        break;
      }
      case 'update': {
        clip.start_ms = command.start_ms;
        clip.end_ms = command.end_ms;
        clip.speed = command.speed;
        break;
      }
      case 'enable': {
        if (typeof command.enabled !== 'boolean') throw new Error('INVALID_COMPOSITION');
        clip.enabled = command.enabled;
        break;
      }
      case 'split': {
        const span = compositionSpans(before)[index];
        if (
          !Number.isInteger(command.at_ms) ||
          command.at_ms <= span.start_ms ||
          command.at_ms >= span.end_ms
        ) {
          throw new Error('COMPOSITION_SPLIT');
        }
        const at = Math.round(clip.start_ms + (command.at_ms - span.start_ms) * clip.speed);
        next.clips.splice(
          index,
          1,
          { ...clip, end_ms: at },
          { ...clip, id: command.new_id, start_ms: at },
        );
        ancestry.set(command.new_id, [clip.id]);
        break;
      }
      case 'join': {
        const right = next.clips[index + 1];
        if (
          !right ||
          right.source.sha256 !== clip.source.sha256 ||
          right.source.path !== clip.source.path ||
          right.start_ms !== clip.end_ms ||
          right.speed !== clip.speed
        )
          throw new Error('COMPOSITION_JOIN');
        ancestry.set(clip.id, [clip.id, right.id]);
        clip.end_ms = right.end_ms;
        next.clips.splice(index + 1, 1);
        break;
      }
      default:
        throw new Error('INVALID_COMPOSITION');
    }
  }
  const composition = parseComposition(next);
  return {
    composition,
    cues: remapCompositionCues(before, composition, cues, ancestry),
    // The voice track is remapped through the same clip-clock mapping; it needs the same explicit
    // split/join ancestry the captions just used, so the two can never disagree about an edit.
    ancestry,
  };
}
