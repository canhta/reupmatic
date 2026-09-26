"""One cancellable hosted-synthesis child; the credential reaches it only through env."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from runtime.errors import WorkerError
from runtime.hosted_egress import deny_network_except_host
from runtime.model_result import atomic_json
from speech.synthesis.contracts import SAMPLE_RATES
from speech.synthesis.hosted import get_operation

CREDENTIAL_ENV_VAR = "REUPMATIC_SPEECH_PROVIDER_CREDENTIAL"


def run(job: dict, directory: Path) -> dict:
    credential = os.environ.get(CREDENTIAL_ENV_VAR)
    if not credential:
        raise WorkerError("MODEL_INFERENCE_FAILED")
    adapter = get_operation(job["provider"]["protocol"], "speech")
    outcome = adapter(job, credential)
    data = {key: outcome[key] for key in ("sample_rate", "frames", "segments", "runtime")}
    if data["sample_rate"] not in SAMPLE_RATES or data["frames"] < 1:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    path = directory / "speech.wav"
    path.write_bytes(outcome["wav"])
    if path.stat().st_size != 44 + data["frames"] * 2:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    return data


def main() -> None:
    path = Path(sys.argv[1])
    try:
        job = json.loads(path.read_text(encoding="utf-8"))
        sys.addaudithook(deny_network_except_host(job["provider"]["endpoint_host"]))
        data = run(job, path.parent)
        result = {"ok": True, "data": data}
    except WorkerError as error:
        result = {"ok": False, "code": error.code}
    except Exception:
        # No remote body, credential or traceback in the result file or stdout.
        result = {"ok": False, "code": "MODEL_INFERENCE_FAILED"}
    atomic_json(path.parent / "result.json", result)


if __name__ == "__main__":
    main()
