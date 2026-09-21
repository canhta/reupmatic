"""Convert adapter segment seconds to bounded, non-overlapping source-clock cues,
plus any word-level timings a companion forced aligner attached to a segment.

Word timings are returned as their own list, each referencing a cue by `cue_id`,
never as a field on the cue dict itself: the shared `Cue` shape every other text
layer trusts (`app/core/subtitles/cues.ts`) stays exactly `{id, start_ms, end_ms,
text, style?}` whether or not an aligner ran, so aligning can never leak into the
displayed, translated or spoken layers through a widened cue shape.

An engine that returns its own segments keeps them exactly: its cue count and
boundaries pass through untouched. Only an engine that returns none (`segments`
is a single whole-range placeholder, as Qwen3-ASR produces) has cues derived
from the aligner's word timings. Deriving moves boundaries between whole
aligner word tokens and slices the transcript at those points, so the
recognised characters are never reordered, re-punctuated, dropped or merged:
`"".join(cue["text"] for cue in cues)` is always the engine's own transcript.
"""

import json
import math
from collections.abc import Callable, Iterable

from runtime.errors import WorkerError

# Published per-language subtitle limits, not ours to invent. Fetched
# from Netflix's Timed Text Style Guides. A single Latin-shaped rule is wrong
# here: Chinese has no inter-word spaces and needs roughly 2.6x less text per
# line and a slower reading speed. Vietnamese writes syllables separated by
# spaces, so a space is not automatically a word boundary.
SEGMENTATION_LIMITS = {
    "en": {"characters_per_line": 42, "max_lines": 2, "reading_speed_cps": 20},
    "vi": {"characters_per_line": 42, "max_lines": 2, "reading_speed_cps": 17},
    "zh": {"characters_per_line": 16, "max_lines": 2, "reading_speed_cps": 9},
}
# General Requirements: a subtitle event lasts at least 5/6 s (20 frames at
# 24fps) and at most 7 s.
MIN_CUE_MS = round(1000 * 5 / 6)
MAX_CUE_MS = 7000
# Joining words back into transcript text: Chinese runs characters together.
WORD_SEPARATOR = {"en": " ", "vi": " ", "zh": ""}

# ---------------------------------------------------------------------------
# Proposal values awaiting the owner.
#
# Netflix and the BBC publish how a subtitle should read, not how to cut a
# continuous transcript at word timings, so none of these has a published
# basis. They live together here, named, so the owner settles all four in one
# edit rather than finding them scattered through the code. They are
# preferences used by `_segment_words`; they are never presented as
# authoritative. The per-language `SEGMENTATION_LIMITS` above are sourced and
# are not part of this block.
SEGMENTATION_PROPOSALS = {
    # A cue break is preferred at a word gap at least this long.
    "preferred_break_gap_ms": 600,
    # When no preferred gap is available, a cue may end mid-sentence at the
    # point where a sourced limit below would be exceeded.
    "allow_mid_sentence_break": True,
    # Smallest gap left between consecutive cues (Netflix removed its frame-gap
    # section in 2020 and publishes none).
    "minimum_cue_gap_ms": 80,
    # Aim below the published reading-speed ceiling rather than sitting on it.
    "reading_speed_target_ratio": 0.9,
}


def timed_segments(
    segments: Iterable,
    start_ms: int,
    end_ms: int,
    progress: Callable[[int], None],
    *,
    language: str = "en",
    engine_segments: bool = True,
) -> tuple[list[dict], list[dict]]:
    cues, words = collect_cues(segments, start_ms, end_ms, progress)
    if engine_segments or len(cues) != 1 or not words:
        return cues, words
    return derive_cues(cues[0], words, end_ms, language)


def collect_cues(
    segments: Iterable, start_ms: int, end_ms: int, progress: Callable[[int], None]
) -> tuple[list[dict], list[dict]]:
    cues: list[dict] = []
    words: list[dict] = []
    previous = start_ms
    size = 0
    duration = end_ms - start_ms
    for index, segment in enumerate(segments):
        if index >= 10000:
            raise WorkerError("SPEECH_RESULT_TOO_LARGE")
        start, end, text = segment.start, segment.end, segment.text
        if (
            type(start) not in (int, float)
            or type(end) not in (int, float)
            or not math.isfinite(start)
            or not math.isfinite(end)
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
        cue = {"id": f"stt-{index + 1}", "start_ms": first, "end_ms": last, "text": text.strip()}
        size += len(json.dumps(cue, ensure_ascii=False).encode("utf-8"))
        if size > 900000:
            raise WorkerError("SPEECH_RESULT_TOO_LARGE")
        cues.append(cue)
        word_previous = first
        for item in getattr(segment, "words", None) or []:
            if not isinstance(item, dict) or item.keys() != {"text", "start", "end"}:
                raise WorkerError("SPEECH_TIMING_INVALID")
            wstart, wend, wtext = item["start"], item["end"], item["text"]
            if (
                type(wstart) not in (int, float)
                or type(wend) not in (int, float)
                or not math.isfinite(wstart)
                or not math.isfinite(wend)
                or not 0 <= wstart <= wend
                or not isinstance(wtext, str)
                or not wtext
                or len(wtext) > 1000
                or "\x00" in wtext
            ):
                raise WorkerError("SPEECH_TIMING_INVALID")
            wfirst = start_ms + round(wstart * 1000)
            wlast = min(last, start_ms + round(wend * 1000))
            if wfirst < max(word_previous, first) or wlast <= wfirst:
                raise WorkerError("SPEECH_TIMING_INVALID")
            word = {"cue_id": cue["id"], "start_ms": wfirst, "end_ms": wlast, "text": wtext}
            size += len(json.dumps(word, ensure_ascii=False).encode("utf-8"))
            if size > 900000:
                raise WorkerError("SPEECH_RESULT_TOO_LARGE")
            words.append(word)
            word_previous = wlast
        previous = last
    return cues, words


def derive_cues(
    cue: dict, words: list[dict], end_ms: int, language: str
) -> tuple[list[dict], list[dict]]:
    """Split one whole-range cue at the aligner's word boundaries.

    Falls back to the untouched single cue when the word texts cannot be placed
    back in the transcript: a cue split that might silently rewrite a character
    is worse than no split, and the words still travel with the result. This is
    also what an unsegmented engine without an aligner produces.
    """
    transcript = cue["text"]
    spans = _word_spans(transcript, [word["text"] for word in words])
    if spans is None:
        return [cue], words
    groups = _segment_words(words, language)
    if len(groups) <= 1:
        return [cue], words
    starts = []
    offset = 0
    for group in groups:
        starts.append(offset)
        offset += len(group)
    cues = []
    for position, group in enumerate(groups):
        first_word = starts[position]
        last_word = first_word + len(group) - 1
        start_char = 0 if position == 0 else spans[first_word][0]
        end_char = len(transcript) if position == len(groups) - 1 else spans[last_word + 1][0]
        cues.append(
            {
                "id": f"stt-{position + 1}",
                "start_ms": cue["start_ms"] if position == 0 else group[0]["start_ms"],
                "end_ms": end_ms if position == len(groups) - 1 else group[-1]["end_ms"],
                "text": transcript[start_char:end_char],
            }
        )
    _extend_to_minimum_duration(cues, end_ms)
    mapped = [
        {
            "cue_id": cues[position]["id"],
            "start_ms": word["start_ms"],
            "end_ms": word["end_ms"],
            "text": word["text"],
        }
        for position, group in enumerate(groups)
        for word in group
    ]
    if len(cues) > 10000:
        raise WorkerError("SPEECH_RESULT_TOO_LARGE")
    size = sum(
        len(json.dumps(item, ensure_ascii=False).encode("utf-8")) for item in (*cues, *mapped)
    )
    if size > 900000:
        raise WorkerError("SPEECH_RESULT_TOO_LARGE")
    return cues, mapped


def _word_spans(transcript: str, texts: list[str]) -> list[tuple[int, int]] | None:
    spans = []
    cursor = 0
    for text in texts:
        index = transcript.find(text, cursor)
        if index < 0:
            return None
        spans.append((index, index + len(text)))
        cursor = index + len(text)
    return spans


def _segment_words(words: list[dict], language: str) -> list[list[dict]]:
    limits = SEGMENTATION_LIMITS[language]
    max_characters = limits["characters_per_line"] * limits["max_lines"]
    target_speed = (
        limits["reading_speed_cps"] * SEGMENTATION_PROPOSALS["reading_speed_target_ratio"]
    )
    groups: list[list[dict]] = []
    current: list[dict] = []
    for word in words:
        if current:
            gap = word["start_ms"] - current[-1]["end_ms"]
            candidate = [*current, word]
            preferred = (
                gap >= SEGMENTATION_PROPOSALS["preferred_break_gap_ms"]
                and current[-1]["end_ms"] - current[0]["start_ms"] >= MIN_CUE_MS
            )
            exceeded = (
                word["end_ms"] - current[0]["start_ms"] > MAX_CUE_MS
                or _character_count(candidate, language) > max_characters
                or _reading_speed(candidate, language) > target_speed
            )
            if preferred or (exceeded and SEGMENTATION_PROPOSALS["allow_mid_sentence_break"]):
                groups.append(current)
                current = []
        current.append(word)
    if current:
        groups.append(current)
    return groups


def _character_count(words: list[dict], language: str) -> int:
    separator = WORD_SEPARATOR[language]
    return sum(len(word["text"]) for word in words) + len(separator) * (len(words) - 1)


def _reading_speed(words: list[dict], language: str) -> float:
    # A short cue is displayed for at least the published minimum even when the
    # words themselves take less, so measure against that floor rather than the
    # raw speech span.
    natural = words[-1]["end_ms"] - words[0]["start_ms"]
    duration = max(natural, MIN_CUE_MS)
    return _character_count(words, language) * 1000 / duration


def _extend_to_minimum_duration(cues: list[dict], end_ms: int) -> None:
    minimum_gap = SEGMENTATION_PROPOSALS["minimum_cue_gap_ms"]
    for position, cue in enumerate(cues):
        if cue["end_ms"] - cue["start_ms"] >= MIN_CUE_MS:
            continue
        # Never overlap the next cue. The proposal gap is honoured only when
        # there is room for it; a cue shorter than the published minimum is
        # worse than a cue closer to its neighbour than the proposal asks.
        if position == len(cues) - 1:
            limit = end_ms
        else:
            following = cues[position + 1]["start_ms"]
            limit = min(following, max(following - minimum_gap, cue["start_ms"]))
        cue["end_ms"] = min(cue["start_ms"] + MIN_CUE_MS, max(cue["end_ms"], limit))
