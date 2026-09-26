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
# Optional keys ride beside the params, never into the result or receipt: a cloned voice's
# numeric payload, and a hosted provider's endpoint plus its credential.
OPTIONAL_PARAMS = {"voice", "provider", "credential"}
SAMPLE_RATES = frozenset({16000, 22050, 24000, 32000, 44100, 48000})
MAX_SECONDS = 600
MAX_CUE_SECONDS = 60
GAP_MS = 250
MAX_RESULT = 100000
CLONE_VOICE_KEYS = {"speaker_emb", "ref_codes"}


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


def parse_voice(value: object) -> dict:
    """The v3 Turbo clone payload: a 192-d speaker embedding plus integer reference codes."""
    if not isinstance(value, dict) or set(value) != CLONE_VOICE_KEYS:
        raise WorkerError("SYNTHESIS_CLONE_INVALID")
    emb, codes = value["speaker_emb"], value["ref_codes"]
    if (
        not isinstance(emb, list)
        or len(emb) != 192
        or not any(emb)
        or any(type(n) not in (float, int) or not math.isfinite(n) or abs(n) > 1000 for n in emb)
        or not isinstance(codes, list)
        or not 1 <= len(codes) <= 500
    ):
        raise WorkerError("SYNTHESIS_CLONE_INVALID")
    width = len(codes[0]) if isinstance(codes[0], list) else 0
    if not 1 <= width <= 32 or any(
        not isinstance(row, list)
        or len(row) != width
        or any(type(n) is not int or not 0 <= n < 65536 for n in row)
        for row in codes
    ):
        raise WorkerError("SYNTHESIS_CLONE_INVALID")
    return copy.deepcopy(value)


def parse_options(value: object) -> dict:
    p = exact(value, PARAMS, OPTIONAL_PARAMS)
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
        # The cloned payload is excluded from the text-size bound; it carries no user text.
        measured = {key: entry for key, entry in p.items() if key not in OPTIONAL_PARAMS}
        if (
            not 1 <= len(p["cues"]) <= 100
            or any(
                "style" in c
                or not c["text"].strip()
                or len(c["text"].encode("utf-16-le")) // 2 > 300
                for c in p["cues"]
            )
            or sum(len(c["text"].encode("utf-8")) for c in p["cues"]) > 20000
            or len(json.dumps(measured, ensure_ascii=False, separators=(",", ":")).encode()) > 63000
        ):
            raise WorkerError("SYNTHESIS_LIMIT")
    except UnicodeError:
        raise WorkerError("INVALID_REQUEST") from None
    if ("provider" in p) != ("credential" in p):
        raise WorkerError("INVALID_REQUEST")
    if "provider" in p:
        if "voice" in p:
            raise WorkerError("INVALID_REQUEST")
        provider = p["provider"]
        if not isinstance(provider, dict) or set(provider) != {"protocol", "endpoint_host"}:
            raise WorkerError("INVALID_REQUEST")
        protocol, endpoint_host = provider["protocol"], provider["endpoint_host"]
        if (
            protocol != "vieneu"
            or not isinstance(endpoint_host, str)
            or not endpoint_host
            or len(endpoint_host) > 255
            or "/" in endpoint_host
            or " " in endpoint_host
            or not isinstance(p["credential"], str)
            or not 1 <= len(p["credential"]) <= 4096
        ):
            raise WorkerError("INVALID_REQUEST")
    if "voice" in p:
        p["voice"] = parse_voice(p["voice"])
    return copy.deepcopy(p)


def validate_audio(value: object, params: dict) -> dict:
    """Validate child metadata before promoting its WAV; no provider paths accepted."""
    keys = {"frames", "sample_rate", "segments", "runtime"}
    if (
        not isinstance(value, dict)
        or set(value) != keys
        or not clean(value["runtime"], 256)
        or type(value["sample_rate"]) is not int
        or type(value["frames"]) is not int
        or not isinstance(value["segments"], list)
        or len(value["segments"]) != len(params["cues"])
    ):
        raise WorkerError("MODEL_OUTPUT_INVALID")
    rate = value["sample_rate"]
    if not 1 <= rate <= 192000:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    if rate not in SAMPLE_RATES:
        raise WorkerError("SYNTHESIS_SAMPLE_RATE_UNSUPPORTED")
    if not 1 <= value["frames"] <= rate * MAX_SECONDS:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    start = 0
    for cue, segment in zip(params["cues"], value["segments"]):
        if (
            not isinstance(segment, dict)
            or set(segment) != {"cue_id", "start_frame", "end_frame", "lead_silence_frames"}
            or segment["cue_id"] != cue["id"]
            or type(segment["lead_silence_frames"]) is not int
            or not 0 <= segment["lead_silence_frames"] <= value["frames"]
            or type(segment["start_frame"]) is not int
            or segment["start_frame"] != start + segment["lead_silence_frames"]
            or type(segment["end_frame"]) is not int
            or not segment["start_frame"]
            < segment["end_frame"]
            <= min(segment["start_frame"] + rate * MAX_CUE_SECONDS - 1, value["frames"])
        ):
            raise WorkerError("MODEL_OUTPUT_INVALID")
        start = segment["end_frame"]
    if start != value["frames"]:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    return copy.deepcopy(value)


def make_result(params: dict, audio: dict, artifact_id: str, digest: str) -> dict:
    rate = audio["sample_rate"]
    return {
        "kind": "synthesis",
        **params,
        **audio,
        "artifact_id": artifact_id,
        "sha256": digest,
        "duration_ms": math.ceil(audio["frames"] * 1000 / rate),
    }
