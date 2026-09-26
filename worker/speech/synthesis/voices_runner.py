"""One cancellable hosted voice-list child; the credential reaches it only through env."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from runtime.errors import WorkerError
from runtime.hosted_egress import deny_network_except_host
from runtime.model_result import atomic_json
from speech.synthesis.hosted import get_operation

CREDENTIAL_ENV_VAR = "REUPMATIC_SPEECH_PROVIDER_CREDENTIAL"


def run(job: dict) -> dict:
    credential = os.environ.get(CREDENTIAL_ENV_VAR)
    if not credential:
        raise WorkerError("MODEL_INFERENCE_FAILED")
    return get_operation(job["provider"]["protocol"], "voices")(job, credential)


def main() -> None:
    path = Path(sys.argv[1])
    try:
        job = json.loads(path.read_text(encoding="utf-8"))
        sys.addaudithook(deny_network_except_host(job["provider"]["endpoint_host"]))
        result = {"ok": True, "data": run(job)}
    except WorkerError as error:
        result = {"ok": False, "code": error.code}
    except Exception:
        result = {"ok": False, "code": "MODEL_INFERENCE_FAILED"}
    atomic_json(path.parent / "result.json", result)


if __name__ == "__main__":
    main()
