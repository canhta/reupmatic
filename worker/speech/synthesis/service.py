"""Shared-queue synthesis, all-or-nothing artifact promotion and cancellation."""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import uuid
import wave
from pathlib import Path

from assets.registry import sha256
from runtime.errors import WorkerError
from runtime.model_result import atomic_json
from speech.synthesis.contracts import (
    MAX_RESULT,
    make_result,
    parse_options,
    validate_audio,
)
from speech.synthesis.models import verify_bundle

ERRORS = {
    "MODEL_HASH_MISMATCH",
    "MODEL_RUNTIME_MISSING",
    "RUNTIME_PACK_MISSING",
    "MODEL_INFERENCE_FAILED",
    "MODEL_NETWORK_DISABLED",
    "MODEL_OUTPUT_INVALID",
    "SYNTHESIS_MANIFEST_INVALID",
    "SYNTHESIS_VOICES_INVALID",
    "MODEL_MISSING",
    "SYNTHESIS_RUNTIME_VERSION",
    "SYNTHESIS_SAMPLE_RATE_UNSUPPORTED",
    "SYNTHESIS_TOKEN_LIMIT",
    "SYNTHESIS_LIMIT",
    "SYNTHESIS_VOICE_UNAVAILABLE",
    "SYNTHESIS_CLONE_INVALID",
    "SYNTHESIS_CLONE_UNSUPPORTED_ENGINE",
    "VIENEU_CLONE_WEB_ONLY",
    "VIENEU_KEY_INVALID",
    "VIENEU_OUT_OF_CREDITS",
    "VIENEU_RATE_LIMITED",
    "VIENEU_TEXT_REFUSED",
    "VIENEU_UNAVAILABLE",
}


def read_audio(directory: Path, params: dict) -> dict:
    try:
        response_path = directory / "result.json"
        if response_path.is_symlink():
            raise ValueError
        with response_path.open("rb") as stream:
            raw = stream.read(MAX_RESULT + 1)
        response = json.loads(raw) if len(raw) <= MAX_RESULT else None
        if not isinstance(response, dict):
            raise ValueError
        if response.get("ok") is not True:
            code = response.get("code")
            raise WorkerError(
                code if isinstance(code, str) and code in ERRORS else "MODEL_INFERENCE_FAILED"
            )
        if set(response) != {"ok", "data"}:
            raise ValueError
        data = validate_audio(response["data"], params)
        path = directory / "speech.wav"
        if (
            path.is_symlink()
            or not path.is_file()
            or path.stat().st_size != 44 + data["frames"] * 2
        ):
            raise ValueError
        with wave.open(str(path), "rb") as audio:
            if (
                audio.getparams()[:4] != (1, 2, data["sample_rate"], data["frames"])
                or audio.getcomptype() != "NONE"
            ):
                raise ValueError
            if len(audio.readframes(data["frames"] + 1)) != data["frames"] * 2:
                raise ValueError
        return data
    except (OSError, ValueError, EOFError, wave.Error):
        raise WorkerError("MODEL_OUTPUT_INVALID") from None


def synthesize(host, req: dict) -> dict:
    params = parse_options(req["params"])
    # Optional keys are used in-process only; none reach the result, receipt or job params.
    voice_data = params.pop("voice", None)
    provider = params.pop("provider", None)
    credential = params.pop("credential", None)

    def check():
        return host.cancelled(req)

    if provider is None:
        model = host.synthesis_models.require(
            params["language"], params["voice_id"], params["model_id"], check, voice_data
        )
    else:
        model = None
        voice_data = None
    if shutil.disk_usage(host.workspace).free < 128 * 1024**2:
        raise WorkerError("SYNTHESIS_DISK_LOW")
    root = host.workspace / "speech"
    root.mkdir(exist_ok=True)
    if root.is_symlink() or root.resolve().parent != host.workspace.resolve():
        raise WorkerError("SYNTHESIS_ARTIFACT_INVALID")

    def emit(fraction):
        return host.emit(req, "progress", {"phase": "synthesisRunning", "fraction": fraction})

    with tempfile.TemporaryDirectory(dir=root, prefix=".synthesis-") as directory:
        tmp = Path(directory)
        path = tmp / "request.json"
        if provider is None:
            module = "speech.synthesis.runner"
            child_env = None
            job = {"params": params, "model": model}
            if voice_data is not None:
                job["voice"] = voice_data
        else:
            # `credential` is absent from this dict: the hosted child gets it only via `env`.
            module = "speech.synthesis.hosted_runner"
            child_env = {"REUPMATIC_SPEECH_PROVIDER_CREDENTIAL": credential}
            job = {
                "params": params,
                "provider": provider,
                "request_id": req["id"],
                "voice_id": params["voice_id"],
                "cues": params["cues"],
            }
        path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        emit(None)
        last = -1

        def progress():
            nonlocal last
            try:
                with (tmp / "progress.json").open("rb") as stream:
                    value = json.loads(stream.read(1024))
                completed = value.get("completed")
                if (
                    type(completed) is int
                    and last < completed <= len(params["cues"])
                    and type(value.get("total")) is int
                    and value["total"] == len(params["cues"])
                ):
                    last = completed
                    emit(completed / len(params["cues"]))
            except (OSError, ValueError, AttributeError):
                pass

        host.process.run(
            req,
            [sys.executable, "-u", "-m", module, str(path)],
            cwd=Path(__file__).resolve().parents[2],
            timeout=3600 if provider is None else 600,
            on_poll=progress,
            env=child_env,
        )
        progress()
        check()
        audio = read_audio(tmp, params)
        if model is not None:
            verify_bundle(model, check)
        artifact = str(uuid.uuid4())
        result = make_result(params, audio, artifact, sha256(tmp / "speech.wav", check))
        # Promote only WAV + receipt; requests, model paths and partials stay scratch.
        ready = tmp / "ready"
        ready.mkdir()
        (tmp / "speech.wav").replace(ready / "speech.wav")
        atomic_json(ready / "receipt.json", result)
        for name in ("speech.wav", "receipt.json"):
            with (ready / name).open("rb") as stream:
                os.fsync(stream.fileno())
        check()
        destination = root / artifact
        ready.rename(destination)
        try:
            check()
        except WorkerError:
            shutil.rmtree(destination)
            raise
        return result
