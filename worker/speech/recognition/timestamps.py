"""Convert adapter segment seconds into bounded source-clock cues.

Recognition returns one cue per adapter segment, each carrying the measured word timings it
computed. Sizing the cues for reading speed and layout belongs to the core splitter, not here.

The model's own timing quirks are normalised: overlaps clamp after the previous cue, clocks past
the clip end clamp to it, and what is left empty is dropped. A clock that is not finite, runs
backwards, or lies beyond the model's last window is corrupt and fails the transcript.
"""

import json
import math
from collections.abc import Callable, Iterable

from runtime.errors import WorkerError

# Whisper decodes 30 s windows; the last one runs past the clip into padding, never further.
WINDOW_MS = 30000


def _seconds(value: object) -> bool:
    # faster-whisper returns NumPy float64 for segment and word clocks; `bool` is not a clock.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def _word_spans(segment, offset_ms: int, end_ms: int, floor: int) -> list[tuple[str, int, int]]:
    words = getattr(segment, "words", None)
    if not words:
        return []
    spans: list[tuple[str, int, int]] = []
    previous = floor
    duration = end_ms - offset_ms
    for word in words:
        start, finish, text = word.start, word.end, word.word
        if (
            not _seconds(start)
            or not _seconds(finish)
            or not 0 <= start <= finish
            or finish * 1000 > duration + WINDOW_MS
            or not isinstance(text, str)
            or len(text) > 10000
            or "\x00" in text
        ):
            raise WorkerError("SPEECH_TIMING_INVALID")
        # Real faster-whisper words overlap and carry zero-length tokens around punctuation;
        # clamp to a positive, monotonic span instead of discarding the whole transcript.
        begin = max(offset_ms + round(start * 1000), previous)
        last = min(end_ms, max(offset_ms + round(finish * 1000), begin + 1))
        if begin >= end_ms or last <= begin:
            continue
        previous = last
        if text.strip():
            spans.append((text, begin, last))
    return spans


def _cue_words(spans: list[tuple[str, int, int]]) -> list[dict]:
    words = [{"text": token, "start_ms": begin, "end_ms": last} for token, begin, last in spans]
    # The cue text trims its outer whitespace, so the word texts trim the same edges to rejoin.
    words[0]["text"] = words[0]["text"].lstrip()
    words[-1]["text"] = words[-1]["text"].rstrip()
    kept = [word for word in words if word["text"]]
    return kept if kept and "".join(word["text"] for word in kept) else []


def timed_segments(
    segments: Iterable,
    start_ms: int,
    end_ms: int,
    progress: Callable[[int], None],
) -> list[dict]:
    cues: list[dict] = []
    previous = start_ms
    # Measured words and token clocks overlap across segments; later cues start no earlier.
    floor = start_ms
    size = 0
    duration = end_ms - start_ms
    for index, segment in enumerate(segments):
        if index >= 10000:
            raise WorkerError("SPEECH_RESULT_TOO_LARGE")
        start, end, text = segment.start, segment.end, segment.text
        if (
            not _seconds(start)
            or not _seconds(end)
            or not 0 <= start <= end
            or end * 1000 > duration + WINDOW_MS
            or not isinstance(text, str)
            or len(text) > 10000
            or "\x00" in text
        ):
            raise WorkerError("SPEECH_TIMING_INVALID")
        first = start_ms + round(start * 1000)
        last = min(end_ms, start_ms + round(end * 1000))
        progress(max(0, min(duration, round(end * 1000))))
        if not text.strip():
            continue
        if first < previous:
            raise WorkerError("SPEECH_TIMING_INVALID")
        previous = first
        spans = _word_spans(segment, start_ms, end_ms, floor)
        words = _cue_words(spans) if spans else []
        if words:
            piece_first, piece_last = words[0]["start_ms"], words[-1]["end_ms"]
            piece_text = "".join(word["text"] for word in words)
        else:
            piece_first, piece_last, piece_text = max(first, floor), last, text.strip()
            if piece_last <= piece_first:
                continue
        cue = {
            "id": f"stt-{len(cues) + 1}",
            "start_ms": piece_first,
            "end_ms": piece_last,
            "text": piece_text,
        }
        if words:
            cue["words"] = words
        size += len(json.dumps(cue, ensure_ascii=False).encode("utf-8"))
        if size > 900000:
            raise WorkerError("SPEECH_RESULT_TOO_LARGE")
        cues.append(cue)
        floor = piece_last
    return cues
