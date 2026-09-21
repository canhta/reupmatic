import math
import re

from media.editing.recipe import parse_editing
from runtime.errors import WorkerError
from subtitles.style import parse_style
from vision.algorithms import region


def record(value, required, optional=()):
    if (
        not isinstance(value, dict)
        or not set(required) <= value.keys()
        or value.keys() - set(required) - set(optional)
    ):
        raise WorkerError("INVALID_PROCESSING")
    return value


def number(value, minimum, maximum, integer=False):
    if (
        type(value) not in (int, float)
        or not math.isfinite(value)
        or not minimum <= value <= maximum
        or (integer and type(value) is not int)
    ):
        raise WorkerError("INVALID_PROCESSING")
    return value


def language(value):
    if value not in ("en", "vi", "zh"):
        raise WorkerError("INVALID_PROCESSING")
    return value


def parse_recipe(value, has_subtitles=False):
    value = record(value, (), ("ocr", "inpaint", "editing", "subtitle_style"))
    if not (value.keys() & {"ocr", "inpaint", "editing", "subtitle_style"}):
        raise WorkerError("INVALID_PROCESSING")
    recipe = {}
    if "subtitle_style" in value:
        recipe["subtitle_style"] = parse_style(value["subtitle_style"])
    if "ocr" in value:
        if has_subtitles:
            raise WorkerError("PROCESSING_SUBTITLE_CONFLICT")
        ocr = record(value["ocr"], ("language", "sample_ms", "min_confidence"))
        recipe["ocr"] = {
            "language": language(ocr["language"]),
            "sample_ms": number(ocr["sample_ms"], 100, 2000, True),
            "min_confidence": number(ocr["min_confidence"], 0, 1),
        }
    if "inpaint" in value:
        paint = record(value["inpaint"], ("target", "padding_px"), ("region", "language"))
        padding = number(paint["padding_px"], 0, 32, True)
        if paint["target"] == "manual" and "language" not in paint:
            try:
                rectangle = region(paint.get("region"))
            except WorkerError:
                raise WorkerError("INVALID_PROCESSING") from None
            recipe["inpaint"] = {"target": "manual", "padding_px": padding, "region": rectangle}
        elif paint["target"] == "text" and "region" not in paint:
            recipe["inpaint"] = {
                "target": "text",
                "padding_px": padding,
                "language": language(paint.get("language")),
            }
        else:
            raise WorkerError("INVALID_PROCESSING")
    if "editing" in value:
        recipe["editing"] = parse_editing(value["editing"])
    return recipe


def required_models(recipe):
    keys = set()
    if "ocr" in recipe:
        keys.add("ocr_" + recipe["ocr"]["language"])
    if "inpaint" in recipe:
        keys.add("inpainting")
        if recipe["inpaint"]["target"] == "text":
            keys.add("ocr_" + recipe["inpaint"]["language"])
    return sorted(keys)


def parse_fingerprints(value, recipe):
    keys = required_models(recipe)
    if (
        not isinstance(value, dict)
        or set(value) != set(keys)
        or any(
            not isinstance(v, str) or not re.fullmatch("[a-f0-9]{64}", v) for v in value.values()
        )
    ):
        raise WorkerError("INVALID_PROCESSING_MODELS")
    return {key: value[key] for key in keys}


def resolve_models(host, req, recipe):
    fingerprints = {}
    for key in required_models(recipe):
        kind, lang = ("ocr", key[4:]) if key.startswith("ocr_") else ("inpainting", None)
        bundle = host.models.require(kind, lang, check=lambda: host.cancelled(req))
        fingerprints[key] = bundle["fingerprint"]
    return fingerprints


def model_snapshot(host, req):
    from runtime.protocol import exact

    params = exact(req["params"], {"processing"})
    return resolve_models(host, req, parse_recipe(params["processing"]))
