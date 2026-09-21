import json
import math
from fractions import Fraction
from pathlib import Path

from runtime.context import WorkerContext
from runtime.errors import WorkerError
from runtime.protocol import exact


def frame_rate(video):
    for key in ("avg_frame_rate", "r_frame_rate"):
        try:
            value = Fraction(video.get(key, "0/1"))
            if 0 < value <= 240:
                return str(value)
        except (ValueError, ZeroDivisionError):
            continue
    raise WorkerError("INVALID_FRAME_RATE")


def display_size(video):
    width, height = video["width"], video["height"]
    try:
        aspect = Fraction(video.get("sample_aspect_ratio", "1:1").replace(":", "/"))
    except (ValueError, ZeroDivisionError):
        aspect = Fraction(1)
    if aspect <= 0:
        aspect = Fraction(1)
    width = round(width * aspect)
    rotation = next(
        (entry["rotation"] for entry in video.get("side_data_list", []) if "rotation" in entry),
        video.get("tags", {}).get("rotate", 0),
    )
    rotation = float(rotation) % 360
    if rotation in (90, 270):
        width, height = height, width
    elif rotation not in (0, 180):
        raise WorkerError("UNSUPPORTED_ROTATION")
    return width, height


def probe_file(host: WorkerContext, req: dict, path: Path) -> dict:
    data = json.loads(
        host.process.run(
            req,
            [
                host.ffprobe,
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                str(path),
            ],
            timeout=30,
        )
    )
    video = next(
        (stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"), None
    )
    if not video:
        raise WorkerError("NO_VIDEO")
    duration = float(data.get("format", {}).get("duration", video.get("duration", 0)))
    if not math.isfinite(duration) or duration <= 0:
        raise WorkerError("INVALID_DURATION")
    width, height = display_size(video)
    return {
        "duration_ms": round(duration * 1000),
        "width": width,
        "height": height,
        "frame_rate": frame_rate(video),
        "container": str(data.get("format", {}).get("format_name", "")),
        "codec": str(video.get("codec_name", "")),
        "has_audio": any(stream.get("codec_type") == "audio" for stream in data.get("streams", [])),
    }


def probe(host: WorkerContext, req: dict) -> dict:
    params = exact(req["params"], {"asset_id"})
    asset = host.assets.get(params["asset_id"], "video")
    result = probe_file(host, req, asset["path"])
    host.assets.get(params["asset_id"], "video")
    return result
