"""VieNeu Cloud credential and endpoint validation for worker-side hosted calls."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from runtime.errors import WorkerError
from runtime.protocol import exact, string

MAX_RESULT = 1024 * 1024
CLOUD_ERRORS = {
    "MODEL_INFERENCE_FAILED",
    "MODEL_NETWORK_DISABLED",
    "MODEL_OUTPUT_INVALID",
    "VIENEU_KEY_INVALID",
    "VIENEU_OUT_OF_CREDITS",
    "VIENEU_RATE_LIMITED",
    "VIENEU_UNAVAILABLE",
}


def parse_provider(value: object) -> dict:
    p = exact(value, {"protocol", "endpoint_host"})
    protocol = string(p["protocol"], 64)
    endpoint_host = string(p["endpoint_host"], 255)
    if protocol != "vieneu" or "/" in endpoint_host or " " in endpoint_host:
        raise WorkerError("INVALID_REQUEST")
    return dict(p)


def parse_credential(value: object) -> str:
    if not isinstance(value, str) or not value or len(value) > 4096:
        raise WorkerError("INVALID_REQUEST")
    return value


def read_result(path: Path) -> dict:
    try:
        with path.open("rb") as stream:
            raw = stream.read(MAX_RESULT + 1)
        response = json.loads(raw) if len(raw) <= MAX_RESULT else None
        if not isinstance(response, dict):
            raise ValueError
        if response.get("ok") is not True:
            code = response.get("code")
            raise WorkerError(
                code if isinstance(code, str) and code in CLOUD_ERRORS else "MODEL_INFERENCE_FAILED"
            )
        if set(response) != {"ok", "data"} or not isinstance(response["data"], dict):
            raise ValueError
        return response["data"]
    except (OSError, ValueError, TypeError):
        raise WorkerError("MODEL_OUTPUT_INVALID") from None


def list_voices(host, req: dict) -> dict:
    p = exact(req["params"], {"provider", "credential"})
    provider = parse_provider(p["provider"])
    # `credential` never reaches the job file on disk; the child gets it via env instead.
    credential = parse_credential(p["credential"])
    host.emit(req, "progress", {"phase": "synthesisCloudVoices", "fraction": None})
    with tempfile.TemporaryDirectory(dir=host.workspace, prefix="speech-cloud-") as directory:
        tmp = Path(directory)
        path = tmp / "request.json"
        path.write_text(json.dumps({"provider": provider}, ensure_ascii=False), encoding="utf-8")
        host.process.run(
            req,
            [sys.executable, "-u", "-m", "speech.synthesis.voices_runner", str(path)],
            cwd=Path(__file__).resolve().parents[2],
            timeout=60,
            env={"REUPMATIC_SPEECH_PROVIDER_CREDENTIAL": credential},
        )
        return read_result(tmp / "result.json")
