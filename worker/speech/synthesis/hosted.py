"""VieNeu Cloud v4 wire adapter: OpenAI-compatible synthesis and voice listing, BYOK."""

from __future__ import annotations

import hashlib
import io
import json
import urllib.error
import urllib.request
import wave
from typing import Callable

from runtime.errors import WorkerError
from runtime.tls import https_context
from speech.synthesis.contracts import SAMPLE_RATES

MODEL = "vieneu-v4"
SAMPLE_RATE = 48000
_TIMEOUT = 120
_MAX_RESPONSE = 64 * 1024**2


def _raise_for(error: urllib.error.HTTPError) -> None:
    """401 bad key, 403 no credits/plan, 410 cloning is web-only, 422 refused, 429 limited."""
    status = error.code
    if status == 401:
        raise WorkerError("VIENEU_KEY_INVALID") from None
    if status == 403:
        raise WorkerError("VIENEU_OUT_OF_CREDITS") from None
    if status == 410:
        raise WorkerError("VIENEU_CLONE_WEB_ONLY") from None
    if status == 422:
        raise WorkerError("VIENEU_TEXT_REFUSED") from None
    if status == 429:
        raise WorkerError("VIENEU_RATE_LIMITED") from None
    if status >= 500:
        raise WorkerError("VIENEU_UNAVAILABLE") from None
    raise WorkerError("MODEL_INFERENCE_FAILED") from None


def _post(url: str, headers: dict[str, str], body: dict) -> tuple[int, bytes]:
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT, context=https_context()) as response:  # noqa: S310
            raw = response.read(_MAX_RESPONSE + 1)
            return response.status, raw
    except urllib.error.HTTPError as error:
        # Never echo the remote body: it is untrusted content.
        _raise_for(error)
    except (urllib.error.URLError, OSError, TimeoutError):
        raise WorkerError("MODEL_NETWORK_DISABLED") from None


def _get(url: str, headers: dict[str, str]) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT, context=https_context()) as response:  # noqa: S310
            return response.status, response.read(_MAX_RESPONSE + 1)
    except urllib.error.HTTPError as error:
        _raise_for(error)
    except (urllib.error.URLError, OSError, TimeoutError):
        raise WorkerError("MODEL_NETWORK_DISABLED") from None


def idempotency_key(request_id: str, cue: dict) -> str:
    """Deterministic per cue so a retry of the same request never double-charges."""
    seed = f"{request_id}:{cue['id']}:{cue['text']}".encode()
    return hashlib.sha256(seed).hexdigest()


def _headers(credential: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {credential}", "Content-Type": "application/json"}


def cues_to_wav(job: dict, credential: str) -> dict:
    """One cloud request per cue, concatenated with the same 250 ms lead the local engine uses."""
    provider = job["provider"]
    rate = SAMPLE_RATE
    gap = rate * 250 // 1000
    frames = 0
    segments = []
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        for cue in job["cues"]:
            status, raw = _post(
                f"https://{provider['endpoint_host']}/api/v1/audio/speech",
                {
                    **_headers(credential),
                    "Idempotency-Key": idempotency_key(job["request_id"], cue),
                },
                {
                    "model": MODEL,
                    "input": cue["text"],
                    "voice": job["voice_id"],
                    "response_format": "wav",
                    "sample_rate": rate,
                },
            )
            if status != 200 or len(raw) > _MAX_RESPONSE:
                raise WorkerError("MODEL_OUTPUT_INVALID")
            try:
                with wave.open(io.BytesIO(raw), "rb") as audio:
                    if (
                        audio.getnchannels() != 1
                        or audio.getsampwidth() != 2
                        or audio.getframerate() not in SAMPLE_RATES
                        or audio.getcomptype() != "NONE"
                    ):
                        raise ValueError
                    payload = audio.readframes(audio.getnframes())
                    size = audio.getnframes()
            except (wave.Error, ValueError, EOFError):
                raise WorkerError("MODEL_OUTPUT_INVALID") from None
            if size < 1:
                raise WorkerError("MODEL_OUTPUT_INVALID")
            lead = gap if segments else 0
            start = frames + lead
            if lead:
                output.writeframesraw(bytes(lead * 2))
            output.writeframesraw(payload)
            frames = start + size
            segments.append(
                {
                    "cue_id": cue["id"],
                    "start_frame": start,
                    "end_frame": frames,
                    "lead_silence_frames": lead,
                }
            )
    return {
        "wav": buffer.getvalue(),
        "sample_rate": rate,
        "frames": frames,
        "segments": segments,
        "runtime": f"vieneu-cloud;model={MODEL}",
    }


def voices(job: dict, credential: str) -> dict:
    provider = job["provider"]
    status, raw = _get(
        f"https://{provider['endpoint_host']}/api/v1/audio/voices", _headers(credential)
    )
    if status != 200 or len(raw) > _MAX_RESPONSE:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    try:
        value = json.loads(raw)
    except ValueError:
        raise WorkerError("MODEL_OUTPUT_INVALID") from None
    data = value.get("data") if isinstance(value, dict) else None
    if not isinstance(data, list):
        raise WorkerError("MODEL_OUTPUT_INVALID")
    result = []
    for entry in data:
        if not isinstance(entry, dict):
            raise WorkerError("MODEL_OUTPUT_INVALID")
        voice_id, name = entry.get("id"), entry.get("name", entry.get("label"))
        kind = entry.get("kind", "preset")
        if not isinstance(voice_id, str) or not voice_id or len(voice_id) > 128:
            raise WorkerError("MODEL_OUTPUT_INVALID")
        label = name if isinstance(name, str) and name else voice_id
        if len(label) > 160:
            label = label[:160]
        result.append({"id": voice_id, "label": label, "kind": kind})
    return {"voices": result}


HOSTED_PROTOCOLS: dict[str, dict[str, Callable[[dict, str], dict]]] = {
    "vieneu": {"speech": cues_to_wav, "voices": voices}
}


def get_operation(protocol: str, name: str) -> Callable[[dict, str], dict]:
    try:
        return HOSTED_PROTOCOLS[protocol][name]
    except KeyError:
        raise WorkerError("MODEL_RUNTIME_MISSING") from None
