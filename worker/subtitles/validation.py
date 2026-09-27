from typing import Any

from runtime.errors import WorkerError
from runtime.protocol import bounded_int, exact, string

from subtitles.style import parse_style

MAX_CUE_WORDS = 2000


def _validate_words(cue: dict) -> None:
    words = cue.get("words")
    if words is None:
        return
    if not isinstance(words, list) or not 1 <= len(words) <= MAX_CUE_WORDS:
        raise WorkerError("INVALID_CUES")
    start = cue["start_ms"]
    end = cue["end_ms"]
    previous = start
    joined: list[str] = []
    for word in words:
        if (
            not isinstance(word, dict)
            or set(word) != {"text", "start_ms", "end_ms"}
            or not isinstance(word["text"], str)
            or not word["text"]
            or len(word["text"]) > 10000
            or "\x00" in word["text"]
            or type(word["start_ms"]) is not int
            or type(word["end_ms"]) is not int
            or not start <= word["start_ms"] <= word["end_ms"] <= end
            or word["start_ms"] < previous
        ):
            raise WorkerError("INVALID_CUES")
        previous = word["end_ms"]
        joined.append(word["text"])
    if "".join(joined) != cue["text"]:
        raise WorkerError("INVALID_CUES")


def validate_cues(cues: Any) -> list[dict]:
    if not isinstance(cues, list) or len(cues) > 10000:
        raise WorkerError("INVALID_CUES")
    ids: set[str] = set()
    for cue in cues:
        exact(cue, {"id", "start_ms", "end_ms", "text"}, {"style", "words", "source_cue_id"})
        if "style" in cue:
            parse_style(cue["style"])
        if "source_cue_id" in cue:
            string(cue["source_cue_id"], 128)
        cid = string(cue["id"], 128)
        if cid in ids:
            raise WorkerError("INVALID_CUES")
        ids.add(cid)
        start = bounded_int(cue["start_ms"], 0, 24 * 3600 * 1000)
        end = bounded_int(cue["end_ms"], 1, 24 * 3600 * 1000)
        if (
            end <= start
            or not isinstance(cue["text"], str)
            or len(cue["text"]) > 10000
            or "\x00" in cue["text"]
        ):
            raise WorkerError("INVALID_CUES")
        _validate_words(cue)
    return cues
