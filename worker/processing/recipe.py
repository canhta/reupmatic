import math
import re

from media.editing.recipe import parse_editing
from runtime.errors import WorkerError
from subtitles.style import parse_style


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
    value = record(value, (), ("ocr", "editing", "subtitle_style"))
    if not (value.keys() & {"ocr", "editing", "subtitle_style"}):
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
    if "editing" in value:
        recipe["editing"] = parse_editing(value["editing"])
    return recipe


def required_models(recipe):
    keys = set()
    if "ocr" in recipe:
        keys.add("ocr_" + recipe["ocr"]["language"])
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
        lang = key[4:]
        bundle = host.models.require("ocr", lang, check=lambda: host.cancelled(req))
        fingerprints[key] = bundle["fingerprint"]
    return fingerprints


def model_snapshot(host, req):
    from runtime.protocol import exact

    params = exact(req["params"], {"processing"})
    return resolve_models(host, req, parse_recipe(params["processing"]))
