"""Small spoken-text request and natural, unaligned PCM result contract."""

from __future__ import annotations

import copy
import json
import math
import re

from runtime.errors import WorkerError
from runtime.protocol import exact
from subtitles.validation import validate_cues

PARAMS = {"source_layer", "source_token", "language", "model_id", "voice_id", "cues"}
RATE = 48000
GAP = 12000
MAX_FRAMES = RATE * 600
MAX_RESULT = 100000


def clean(value: object, limit: int) -> bool:
    try:
        return (
            isinstance(value, str)
            and bool(value.strip())
            and len(value.encode("utf-16-le")) // 2 <= limit
            and not re.search(r"[\x00-\x1f\x7f]", value)
        )
    except UnicodeError:
        return False


def parse_options(value: object) -> dict:
    p = exact(value, PARAMS)
    if (
        p["source_layer"] != "spoken"
        or p["language"] not in ("en", "vi")
        or not isinstance(p["source_token"], str)
        or not re.fullmatch("[a-zA-Z0-9_-]{8,128}", p["source_token"])
        or not isinstance(p["model_id"], str)
        or not re.fullmatch("[a-f0-9]{64}", p["model_id"])
        or not clean(p["voice_id"], 128)
    ):
        raise WorkerError("INVALID_REQUEST")
    validate_cues(p["cues"])
    try:
        if (
            not 1 <= len(p["cues"]) <= 100
            or any(
                "style" in c
                or not c["text"].strip()
                or len(c["text"].encode("utf-16-le")) // 2 > 300
                for c in p["cues"]
            )
            or sum(len(c["text"].encode("utf-8")) for c in p["cues"]) > 20000
            or len(json.dumps(p, ensure_ascii=False, separators=(",", ":")).encode()) > 63000
        ):
            raise WorkerError("SYNTHESIS_LIMIT")
    except UnicodeError:
        raise WorkerError("INVALID_REQUEST") from None
    return copy.deepcopy(p)


def validate_audio(value: object, params: dict) -> dict:
    """Validate child metadata before promoting its WAV; no provider paths accepted."""
    keys = {"frames", "segments", "runtime"}
    if (
        not isinstance(value, dict)
        or set(value) != keys
        or not clean(value["runtime"], 256)
        or type(value["frames"]) is not int
        or not 1 <= value["frames"] <= MAX_FRAMES
        or not isinstance(value["segments"], list)
        or len(value["segments"]) != len(params["cues"])
    ):
        raise WorkerError("MODEL_OUTPUT_INVALID")
    start = 0
    for cue, segment in zip(params["cues"], value["segments"]):
        if (
            not isinstance(segment, dict)
            or set(segment) != {"cue_id", "start_frame", "end_frame"}
            or segment["cue_id"] != cue["id"]
            or type(segment["start_frame"]) is not int
            or segment["start_frame"] != start
            or type(segment["end_frame"]) is not int
            or not start < segment["end_frame"] <= min(start + RATE * 60 - 1, value["frames"])
        ):
            raise WorkerError("MODEL_OUTPUT_INVALID")
        start = segment["end_frame"] + GAP
    if start - GAP != value["frames"]:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    return copy.deepcopy(value)


def make_result(params: dict, audio: dict, artifact_id: str, digest: str) -> dict:
    return {
        "kind": "synthesis",
        **params,
        **audio,
        "artifact_id": artifact_id,
        "sha256": digest,
        "sample_rate": RATE,
        "duration_ms": math.ceil(audio["frames"] * 1000 / RATE),
        "timing": "natural-sequential",
        "gap_ms": 250,
    }
