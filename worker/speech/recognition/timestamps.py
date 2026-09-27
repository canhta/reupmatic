"""Convert adapter segment seconds into bounded source-clock cues."""

import json
import math
from collections.abc import Callable, Iterable

from runtime.errors import WorkerError

# Subtitle sizing for short-form video. Product policy: pending owner confirmation.
MAX_CUE_CHARS = 42
MAX_CUE_MS = 3500


def _seconds(value: object) -> bool:
    # faster-whisper returns NumPy float64 for segment and word clocks; `bool` is not a clock.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def _cue_text(tokens: list[str]) -> str:
    # Adapter word tokens carry their own leading space, so joining preserves Latin spacing and
    # does not insert gaps into scripts that have none.
    return "".join(tokens).strip()


def _word_spans(segment, offset_ms: int, end_ms: int) -> list[tuple[str, int, int]]:
    words = getattr(segment, "words", None)
    if not words:
        return []
    spans: list[tuple[str, int, int]] = []
    previous = offset_ms
    duration = end_ms - offset_ms
    for word in words:
        start, finish, text = word.start, word.end, word.word
        if (
            not _seconds(start)
            or not _seconds(finish)
            or not 0 <= start <= finish
            or finish * 1000 > duration + 100
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


def _sized_piece(tokens: list[tuple[str, int, int]]) -> tuple[int, int, str, list[dict]]:
    text = _cue_text([token[0] for token in tokens])
    words = [{"text": token[0], "start_ms": token[1], "end_ms": token[2]} for token in tokens]
    # `_cue_text` trims the outer whitespace, so the word texts must trim the same edges to rejoin.
    words[0]["text"] = words[0]["text"].lstrip()
    words[-1]["text"] = words[-1]["text"].rstrip()
    return tokens[0][1], tokens[-1][2], text, [word for word in words if word["text"]]


def _size_words(spans: list[tuple[str, int, int]]) -> list[tuple[int, int, str, list[dict]]]:
    """Split words under the cue character and duration limits, keeping word timings."""
    cues: list[tuple[int, int, str, list[dict]]] = []
    tokens: list[tuple[str, int, int]] = []
    begin = 0
    for text, start, finish in spans:
        if tokens and (
            len(_cue_text([*[token[0] for token in tokens], text])) > MAX_CUE_CHARS
            or finish - begin > MAX_CUE_MS
        ):
            cues.append(_sized_piece(tokens))
            tokens = []
        if not tokens:
            begin = start
        tokens.append((text, start, finish))
    if tokens:
        cues.append(_sized_piece(tokens))
    return cues


def timed_segments(
    segments: Iterable,
    start_ms: int,
    end_ms: int,
    progress: Callable[[int], None],
) -> list[dict]:
    cues: list[dict] = []
    previous = start_ms
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
            or end * 1000 > duration + 100
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
        if first < previous or last <= first:
            raise WorkerError("SPEECH_TIMING_INVALID")
        spans = _word_spans(segment, start_ms, end_ms)
        pieces = _size_words(spans) if spans else [(first, last, text.strip(), [])]
        for piece_first, piece_last, piece_text, piece_words in pieces:
            cue = {
                "id": f"stt-{len(cues) + 1}",
                "start_ms": piece_first,
                "end_ms": piece_last,
                "text": piece_text,
            }
            if piece_words:
                cue["words"] = piece_words
            size += len(json.dumps(cue, ensure_ascii=False).encode("utf-8"))
            if size > 900000:
                raise WorkerError("SPEECH_RESULT_TOO_LARGE")
            cues.append(cue)
        previous = last
    return cues
