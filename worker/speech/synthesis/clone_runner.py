"""One cancellable clone-encode child: offline, no child processes, no downloads."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from runtime.errors import WorkerError
from runtime.model_result import atomic_json
from runtime.offline import deny_network_and_children
from speech.synthesis.adapters import vieneu_v3_turbo_clone
from speech.synthesis.contracts import parse_voice

MAX_RESULT = 16 * 1024**2


def run(job: dict, directory: Path) -> dict:
    data = vieneu_v3_turbo_clone.encode(
        Path(job["root"]),
        Path(job["audio"]),
        bool(job.get("denoise", True)),
    )
    return parse_voice(data)


def main() -> None:
    path = Path(sys.argv[1])
    try:
        os.environ.update(
            HF_HUB_OFFLINE="1",
            HF_HUB_DISABLE_TELEMETRY="1",
            TRANSFORMERS_OFFLINE="1",
            OMP_NUM_THREADS="2",
            OPENBLAS_NUM_THREADS="2",
            MKL_NUM_THREADS="2",
        )
        sys.addaudithook(deny_network_and_children)
        with path.open("rb") as stream:
            job = json.loads(stream.read(200001))
        result = {"ok": True, "data": run(job, path.parent)}
    except WorkerError as error:
        result = {"ok": False, "code": error.code}
    except (ImportError, ModuleNotFoundError):
        result = {"ok": False, "code": "MODEL_RUNTIME_MISSING"}
    except Exception:
        result = {"ok": False, "code": "MODEL_INFERENCE_FAILED"}
    atomic_json(path.parent / "result.json", result)


if __name__ == "__main__":
    main()
