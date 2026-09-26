"""One cancellable hosted-protocol child, separate from the local inference child."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

from runtime.errors import WorkerError
from runtime.hosted_egress import deny_network_except_host
from runtime.model_result import atomic_json
from speech.recognition.hosted import get_protocol
from speech.recognition.timestamps import timed_segments

CREDENTIAL_ENV_VAR = "REUPMATIC_SPEECH_PROVIDER_CREDENTIAL"


def run(job: dict, progress: Path) -> dict:
    credential = os.environ.get(CREDENTIAL_ENV_VAR)
    if not credential:
        raise WorkerError("MODEL_INFERENCE_FAILED")
    adapter = get_protocol(job["provider"]["protocol"])
    outcome = adapter(job, credential)
    duration_ms = job["end_ms"] - job["start_ms"]
    segments = [SimpleNamespace(start=0.0, end=duration_ms / 1000, text=outcome["text"])]
    cues = timed_segments(
        segments,
        job["start_ms"],
        job["end_ms"],
        lambda completed: atomic_json(
            progress, {"completed_ms": completed, "duration_ms": duration_ms}
        ),
    )
    return {"cues": cues, "runtime": outcome["runtime"]}


def main() -> None:
    job_path = Path(sys.argv[1])
    try:
        job = json.loads(job_path.read_text(encoding="utf-8"))
        sys.addaudithook(deny_network_except_host(job["provider"]["endpoint_host"]))
        data = run(job, job_path.parent / "progress.json")
        result = {"ok": True, "data": data}
        if len(json.dumps(result, ensure_ascii=False).encode()) > 1000000:
            raise WorkerError("SPEECH_RESULT_TOO_LARGE")
    except WorkerError as error:
        result = {"ok": False, "code": error.code}
    except Exception:
        # No source contents, credential or library traceback in the result file or stdout.
        result = {"ok": False, "code": "MODEL_INFERENCE_FAILED"}
    atomic_json(job_path.parent / "result.json", result)


if __name__ == "__main__":
    main()
