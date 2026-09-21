"""One cancellable hosted-protocol child, separate from the local inference child
(`speech.recognition.runner`, which this file does not import and which is unmodified by this
ticket). Its egress policy is narrower than that child's blanket denial rather than a relaxation
of it: outbound sockets permitted only to the configured provider's host
(`runtime.hosted_egress.deny_network_except_host`), subprocess and exec still denied.

The credential arrives through this process's own environment
(`REUPMATIC_SPEECH_PROVIDER_CREDENTIAL`) — never through the job file at `job_path`, which
`speech.recognition.service` writes without it (D-55). Cancellation, the progress file and the
result file follow the same contract the local child already uses
(`runtime.model_result.atomic_json`), so `speech.recognition.service` polls and reaps both
children identically.
"""

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
        # Never reachable through the normal path — `SpeechCoordinator` refuses a hosted job
        # with no stored credential before ever asking the worker to run one (`MODEL_MISSING`).
        # A missing environment variable here is the same "not actually usable" situation the
        # existing inference-failure code already speaks to; not a new claim about the request.
        raise WorkerError("MODEL_INFERENCE_FAILED")
    adapter = get_protocol(job["provider"]["protocol"])
    outcome = adapter(job, credential)
    duration_ms = job["end_ms"] - job["start_ms"]
    # DashScope's synchronous call, like Qwen3-ASR locally, returns one transcript spanning the
    # whole requested range and no segmentation of its own — `timed_segments(engine_segments=
    # False)` is the same shared derivation the unsegmented local engine already uses.
    segments = [SimpleNamespace(start=0.0, end=duration_ms / 1000, text=outcome["text"], words=[])]
    cues, words = timed_segments(
        segments,
        job["start_ms"],
        job["end_ms"],
        lambda completed: atomic_json(
            progress, {"completed_ms": completed, "duration_ms": duration_ms}
        ),
        language=job["language"],
        engine_segments=False,
    )
    return {"cues": cues, "words": words, "runtime": outcome["runtime"], "aligner_model_id": None}


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
        # Protocol survives a bad item; no source contents, credential or library traceback in
        # the result file or stdout, exactly the local runner's own top-level guarantee.
        result = {"ok": False, "code": "MODEL_INFERENCE_FAILED"}
    atomic_json(job_path.parent / "result.json", result)


if __name__ == "__main__":
    main()
