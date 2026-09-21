import math

from runtime.errors import WorkerError
from runtime.protocol import exact

VOICE_SAMPLE_RATES = frozenset({16000, 22050, 24000, 32000, 44100, 48000})
_MAX_FRAMES = 192000 * 600


def _number(value, minimum, maximum, integer=True):
    if (
        type(value) not in (int, float)
        or not math.isfinite(value)
        or not minimum <= value <= maximum
        or (integer and type(value) is not int)
    ):
        raise WorkerError("INVALID_VOICE")
    return value


def resolve_voice(host, req, value):
    """The worker's third audio branch: a verified generated WAV plus the plan's line spans."""
    if value is None:
        return None
    p = exact(
        value,
        {
            "asset_id",
            "sha256",
            "sample_rate",
            "mode",
            "gain_db",
            "fade_in_ms",
            "fade_out_ms",
            "lines",
            "muted",
        },
    )
    if type(p["muted"]) is not bool:
        raise WorkerError("INVALID_VOICE")
    # A muted voice lane is absent from the mix and cannot suppress the original.
    if p["muted"]:
        return None
    source = host.assets.verify(p["asset_id"], "audio", lambda: host.cancelled(req))
    if source["sha256"] != p["sha256"]:
        raise WorkerError("SOURCE_CHANGED")
    if (
        type(p["sample_rate"]) is not int
        or p["sample_rate"] not in VOICE_SAMPLE_RATES
        or p["mode"] not in ("replace", "mix")
    ):
        raise WorkerError("INVALID_VOICE")
    lines = p["lines"]
    if not isinstance(lines, list) or not 1 <= len(lines) <= 10000:
        raise WorkerError("INVALID_VOICE")
    previous_end = 0
    for line in lines:
        line = exact(line, {"offset_ms", "rate", "start_frame", "end_frame"})
        _number(line["offset_ms"], 0, 86400000)
        _number(line["rate"], 1, 100, integer=False)
        start = _number(line["start_frame"], 0, _MAX_FRAMES)
        end = _number(line["end_frame"], start + 1, _MAX_FRAMES)
        # Plan spans are in cue order and never overlap.
        if start < previous_end:
            raise WorkerError("INVALID_VOICE")
        previous_end = end
    _number(p["gain_db"], -60, 24, integer=False)
    _number(p["fade_in_ms"], 0, 86400000)
    _number(p["fade_out_ms"], 0, 86400000)
    return {**p, "path": source["path"]}


def fingerprint(voice):
    return (
        {key: value for key, value in voice.items() if key not in ("path", "asset_id")}
        if voice
        else None
    )


def verify_voice(host, req, voice):
    if voice:
        host.assets.verify(voice["asset_id"], "audio", lambda: host.cancelled(req))
