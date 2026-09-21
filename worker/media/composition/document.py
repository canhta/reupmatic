"""One current wire document; source paths are never accepted by the render verb."""

import math
import re

from runtime.errors import WorkerError
from runtime.protocol import exact


def number(value, minimum, maximum, integer=True):
    if (
        type(value) not in (int, float)
        or not math.isfinite(value)
        or not minimum <= value <= maximum
        or (integer and type(value) is not int)
    ):
        raise WorkerError("INVALID_COMPOSITION")
    return value


def parse_composition(value):
    try:
        p = exact(value, {"canvas", "clips"})
        canvas = exact(p["canvas"], {"width", "height", "fps"})
        width = number(canvas["width"], 2, 4096)
        height = number(canvas["height"], 2, 4096)
        if type(canvas["fps"]) is not int or canvas["fps"] != 30:
            raise WorkerError("INVALID_COMPOSITION")
        if (
            width % 2
            or height % 2
            or not isinstance(p["clips"], list)
            or not 1 <= len(p["clips"]) <= 64
        ):
            raise WorkerError("INVALID_COMPOSITION")
        ids, spans, offset = set(), [], 0
        for item in p["clips"]:
            clip = exact(item, {"id", "source", "start_ms", "end_ms", "speed", "enabled"})
            source = exact(clip["source"], {"asset_id", "sha256", "duration_ms"})
            if (
                not isinstance(clip["id"], str)
                or not re.fullmatch(r"[a-zA-Z0-9_-]{1,128}", clip["id"])
                or clip["id"] in ids
                or not isinstance(clip["enabled"], bool)
                or not isinstance(source["asset_id"], str)
                or not 1 <= len(source["asset_id"]) <= 128
                or not isinstance(source["sha256"], str)
                or not re.fullmatch(r"[a-f0-9]{64}", source["sha256"])
            ):
                raise WorkerError("INVALID_COMPOSITION")
            ids.add(clip["id"])
            duration = number(source["duration_ms"], 1, 86400000)
            start = number(clip["start_ms"], 0, duration - 1)
            end = number(clip["end_ms"], start + 1, duration)
            speed = number(clip["speed"], 0.25, 4, False)
            length = math.floor((end - start) / speed + 0.5)
            if length < 100:
                raise WorkerError("COMPOSITION_CLIP_SHORT")
            spans.append({"clip": clip, "start_ms": offset, "end_ms": offset + length})
            offset += length
        if offset > 86400000:
            raise WorkerError("COMPOSITION_DURATION")
        return p, spans, offset
    except (KeyError, TypeError):
        raise WorkerError("INVALID_COMPOSITION") from None
