"""Convert adapter segment seconds to bounded, non-overlapping source-clock cues."""

import json
import math
from collections.abc import Callable, Iterable

from runtime.errors import WorkerError


def timed_segments(
    segments: Iterable, start_ms: int, end_ms: int, progress: Callable[[int], None]
) -> list[dict]:
    result = []
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
        result.append(cue)
        previous = last
    return result
