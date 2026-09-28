"""Queue-owned translation orchestration with bounded outputs and no media render."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

from runtime.errors import WorkerError
from speech.translation.contracts import MAX_RESULT, parse_options, validate_output
from speech.translation.models import verify_bundle

ERRORS = {
    "MODEL_HASH_MISMATCH",
    "MODEL_RUNTIME_MISSING",
    "MODEL_INFERENCE_FAILED",
    "MODEL_NETWORK_DISABLED",
    "MODEL_OUTPUT_INVALID",
    "TRANSLATION_MANIFEST_INVALID",
    "MODEL_MISSING",
    "TRANSLATION_TOKEN_LIMIT",
    "TRANSLATION_TRUNCATED",
    "TRANSLATION_RESULT_TOO_LARGE",
    "TRANSLATION_LIMIT",
}


def read_result(path: Path, params: dict) -> dict:
    try:
        with path.open("rb") as stream:
            raw = stream.read(MAX_RESULT + 1)
        if len(raw) > MAX_RESULT:
            raise WorkerError("TRANSLATION_RESULT_TOO_LARGE")
        response = json.loads(raw)
    except (OSError, ValueError):
        raise WorkerError("MODEL_OUTPUT_INVALID") from None
    if not isinstance(response, dict):
        raise WorkerError("MODEL_OUTPUT_INVALID")
    if response.get("ok") is not True:
        code = response.get("code")
        raise WorkerError(
            code if isinstance(code, str) and code in ERRORS else "MODEL_INFERENCE_FAILED"
        )
    if set(response) != {"ok", "data"}:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    return validate_output(response["data"], params)


def translate(host, req: dict) -> dict:
    p = parse_options(req["params"])

    def check():
        return host.cancelled(req)

    model = host.translation_models.require(
        p["source_language"], p["target_language"], expected_id=p["model_id"], check=check
    )
    if shutil.disk_usage(host.workspace).free < 16 * 1024**2:
        raise WorkerError("TRANSLATION_DISK_LOW")

    def emit(fraction):
        return host.emit(req, "progress", {"phase": "translationRunning", "fraction": fraction})

    with tempfile.TemporaryDirectory(dir=host.workspace, prefix="translation-") as directory:
        tmp = Path(directory)
        path = tmp / "request.json"
        path.write_text(
            json.dumps({"params": p, "model": model}, ensure_ascii=False), encoding="utf-8"
        )
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
                    and last < completed <= len(p["cues"])
                    and value.get("total") == len(p["cues"])
                ):
                    last = completed
                    emit(completed / len(p["cues"]))
            except (OSError, ValueError, AttributeError):
                pass

        host.process.run(
            req,
            [sys.executable, "-u", "-m", "speech.translation.runner", str(path)],
            cwd=Path(__file__).resolve().parents[2],
            timeout=3600,
            on_poll=progress,
        )
        progress()
        check()
        data = read_result(tmp / "result.json", p)
        verify_bundle(model, check)
        result = {"kind": "translation", **p, **data}
        if len(json.dumps(result, ensure_ascii=False).encode()) > MAX_RESULT:
            raise WorkerError("TRANSLATION_RESULT_TOO_LARGE")
        check()
        return result
