from subtitles.style import parse_style
from typing import Any

from runtime.errors import WorkerError
from runtime.protocol import bounded_int, exact, string

def validate_cues(cues: Any) -> list[dict]:
    if not isinstance(cues, list) or len(cues) > 10000:
        raise WorkerError("INVALID_CUES")
    ids: set[str] = set()
    for cue in cues:
        exact(cue, {"id", "start_ms", "end_ms", "text"}, {"style"})
        if "style" in cue:
            parse_style(cue["style"])
        cid = string(cue["id"], 128)
        if cid in ids:
            raise WorkerError("INVALID_CUES")
        ids.add(cid)
        start = bounded_int(cue["start_ms"], 0, 24 * 3600 * 1000)
        end = bounded_int(cue["end_ms"], 1, 24 * 3600 * 1000)
        if end <= start or not isinstance(cue["text"], str) or len(cue["text"]) > 10000 or "\x00" in cue["text"]:
            raise WorkerError("INVALID_CUES")
    return cues
