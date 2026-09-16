import json
import math

from runtime.errors import WorkerError
from runtime.protocol import exact


def probe_audio(host, req, path):
    data = json.loads(host.process.run(req, [host.ffprobe, "-v", "error", "-show_format",
                                           "-show_streams", "-of", "json", str(path)], timeout=30))
    audio = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "audio"), None)
    if not audio:
        raise WorkerError("NO_AUDIO")
    duration = float(data.get("format", {}).get("duration", audio.get("duration", 0)))
    if not math.isfinite(duration) or not 0 < duration <= 86400:
        raise WorkerError("INVALID_DURATION")
    return {"duration_ms": max(1, round(duration * 1000))}


def probe(host, req):
    p = exact(req["params"], {"asset_id"})
    source = host.assets.verify(p["asset_id"], "audio", lambda: host.cancelled(req))
    result = probe_audio(host, req, source["path"])
    host.assets.verify(p["asset_id"], "audio", lambda: host.cancelled(req))
    return result


def resolve_soundtrack(host, req, value):
    if value is None:
        return None
    p = exact(value, {"asset_id", "sha256", "mode", "start_ms", "end_ms", "offset_ms",
                      "gain_db", "fade_in_ms", "fade_out_ms"})
    source = host.assets.verify(p["asset_id"], "audio", lambda: host.cancelled(req))
    if source["sha256"] != p["sha256"]:
        raise WorkerError("SOURCE_CHANGED")
    info = probe_audio(host, req, source["path"])
    def number(key, minimum, maximum, integer=True):
        value = p[key]
        if (type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= maximum
                or (integer and type(value) is not int)):
            raise WorkerError("INVALID_SOUNDTRACK")
        return value
    start = number("start_ms", 0, info["duration_ms"] - 1)
    end = number("end_ms", start + 1, info["duration_ms"])
    fade_in = number("fade_in_ms", 0, end - start)
    number("fade_out_ms", 0, end - start - fade_in)
    number("offset_ms", 0, 86400000)
    number("gain_db", -60, 24, False)
    if p["mode"] not in ("replace", "mix"):
        raise WorkerError("INVALID_SOUNDTRACK")
    return {**p, "path": source["path"]}


def fingerprint(track):
    return {key: value for key, value in track.items() if key not in ("path", "asset_id")} if track else None


def verify_soundtrack(host, req, track):
    if track:
        host.assets.verify(track["asset_id"], "audio", lambda: host.cancelled(req))
