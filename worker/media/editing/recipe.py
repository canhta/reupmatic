import math
import re

from runtime.errors import WorkerError


def record(value, keys, all_required=True):
    if (
        not isinstance(value, dict)
        or not value
        or value.keys() - set(keys)
        or (all_required and set(keys) - value.keys())
    ):
        raise WorkerError("INVALID_EDITING")
    return value


def number(value, minimum, maximum, integer=False):
    if (
        type(value) not in (int, float)
        or not math.isfinite(value)
        or not minimum <= value <= maximum
        or (integer and type(value) is not int)
    ):
        raise WorkerError("INVALID_EDITING")
    return value


def choice(value, options):
    if type(value) not in (str, int) or value not in options:
        raise WorkerError("INVALID_EDITING")
    return value


def time_range(value):
    value = record(value, ("start_ms", "end_ms"))
    start = number(value["start_ms"], 0, 86400000, True)
    end = number(value["end_ms"], start + 1, 86400000, True)
    return {"start_ms": start, "end_ms": end}


LOGO_ANCHORS = (
    "top-left",
    "top-center",
    "top-right",
    "middle-left",
    "center",
    "middle-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
)


def parse_editing(value):
    value = record(
        value,
        ("trim", "crop", "flip", "rotate", "fade", "speed", "color", "audio", "logo", "output"),
        False,
    )
    result = {}
    if "trim" in value:
        result["trim"] = time_range(value["trim"])
    if "crop" in value:
        crop = record(value["crop"], ("x", "y", "width", "height"))
        region = {
            key: number(crop[key], 0.01 if key in ("width", "height") else 0, 1) for key in crop
        }
        if region["x"] + region["width"] > 1 + 1e-9 or region["y"] + region["height"] > 1 + 1e-9:
            raise WorkerError("INVALID_EDITING")
        result["crop"] = region
    if "flip" in value:
        result["flip"] = choice(value["flip"], ("horizontal", "vertical", "both"))
    if "rotate" in value:
        result["rotate"] = choice(value["rotate"], (0, 90, 180, 270))
    if "fade" in value:
        fade = record(value["fade"], ("in_ms", "out_ms", "audio"))
        if type(fade["audio"]) is not bool:
            raise WorkerError("INVALID_EDITING")
        in_ms = number(fade["in_ms"], 0, 86400000, True)
        out_ms = number(fade["out_ms"], 0, 86400000, True)
        if in_ms + out_ms > 86400000:
            raise WorkerError("INVALID_EDITING")
        result["fade"] = {"in_ms": in_ms, "out_ms": out_ms, "audio": fade["audio"]}
    if "speed" in value:
        result["speed"] = number(value["speed"], 0.25, 4)
    if "color" in value:
        color = record(value["color"], ("brightness", "contrast", "saturation"))
        result["color"] = {
            "brightness": number(color["brightness"], -1, 1),
            "contrast": number(color["contrast"], 0, 2),
            "saturation": number(color["saturation"], 0, 3),
        }
    if "audio" in value:
        audio = record(value["audio"], ("muted", "gain_db"))
        if type(audio["muted"]) is not bool:
            raise WorkerError("INVALID_EDITING")
        result["audio"] = {"muted": audio["muted"], "gain_db": number(audio["gain_db"], -60, 24)}
    if "logo" in value:
        raw = value["logo"]
        logo = record(
            raw,
            ("anchor", "margin", "scale", "opacity") + (("media_id",) if "media_id" in raw else ()),
        )
        parsed = {
            "anchor": choice(logo["anchor"], LOGO_ANCHORS),
            "margin": number(logo["margin"], 0, 0.5),
            "scale": number(logo["scale"], 0.01, 1),
            "opacity": number(logo["opacity"], 0, 1),
        }
        if "media_id" in logo:
            media_id = logo["media_id"]
            if not isinstance(media_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{8,128}", media_id):
                raise WorkerError("INVALID_EDITING")
            parsed["media_id"] = media_id
        result["logo"] = parsed
    if "output" in value:
        output = record(value["output"], ("aspect", "fit", "height"))
        result["output"] = {
            "aspect": choice(output["aspect"], ("source", "9:16", "16:9", "1:1", "4:5")),
            "fit": choice(output["fit"], ("contain", "cover")),
            "height": choice(output["height"], (0, 480, 720, 1080, 1920)),
        }
    return result


def resolve_window(editing, duration, sample=None):
    if type(duration) is not int or not 1 <= duration <= 86400000:
        raise WorkerError("EDIT_SOURCE_RANGE")
    edit = parse_editing(editing) if editing is not None else {}
    trim = edit.get("trim", {"start_ms": 0, "end_ms": duration})
    if trim["end_ms"] > duration or (
        sample is not None and time_range(sample)["end_ms"] > duration
    ):
        raise WorkerError("EDIT_SOURCE_RANGE")
    start = max(trim["start_ms"], sample["start_ms"] if sample else 0)
    end = min(trim["end_ms"], sample["end_ms"] if sample else duration)
    if end <= start:
        raise WorkerError("EDIT_EMPTY_RANGE")
    speed = edit.get("speed", 1)
    return {
        "start_ms": start,
        "end_ms": end,
        "speed": speed,
        "duration_ms": max(1, math.floor((end - start) / speed + 0.5)),
    }


def resolve_fade_window(editing, duration, sample):
    """Resolve a render window, widening it when a head/tail fade overlaps a sample."""
    edit = parse_editing(editing) if editing is not None else {}
    window = resolve_window(editing, duration, sample)
    trim = edit.get("trim", {"start_ms": 0, "end_ms": duration})
    speed = window["speed"]
    full_ms = max(1, math.floor((trim["end_ms"] - trim["start_ms"]) / speed + 0.5))
    fade = edit.get("fade")
    if sample is None or not fade:
        return window, None, full_ms
    output_start = max(0, math.floor((window["start_ms"] - trim["start_ms"]) / speed + 0.5))
    output_end = min(full_ms, output_start + window["duration_ms"])
    head = fade["in_ms"] and output_start < fade["in_ms"]
    tail = fade["out_ms"] and output_end > full_ms - fade["out_ms"]
    if not head and not tail:
        return window, None, full_ms
    render_start = trim["start_ms"] if head else window["start_ms"]
    render_end = trim["end_ms"] if tail else window["end_ms"]
    if render_end <= render_start:
        return window, None, full_ms
    return (
        {
            "start_ms": render_start,
            "end_ms": render_end,
            "speed": speed,
            "duration_ms": max(1, math.floor((render_end - render_start) / speed + 0.5)),
        },
        (output_start, output_end),
        full_ms,
    )
