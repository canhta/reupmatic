"""Pinned SDK synthesis in a cancellable offline child; never clone or download."""

from __future__ import annotations

import importlib.metadata
import json
import os
import sys
from pathlib import Path

from runtime.errors import WorkerError
from runtime.model_result import atomic_json
from runtime.offline import deny_network_and_children
from speech.synthesis.contracts import parse_options, validate_audio
from speech.synthesis.models import ENGINES, SDK_VERSION, verify_bundle


def run(job: dict, directory: Path) -> dict:
    params, model = parse_options(job["params"]), job["model"]
    if not isinstance(model, dict) or model.get("engine") not in ENGINES:
        raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
    engine = ENGINES[model["engine"]]
    verify_bundle(model)
    if importlib.metadata.version("vieneu") != SDK_VERSION:
        raise WorkerError("SYNTHESIS_RUNTIME_VERSION")
    root = Path(model["directory"])
    voices = engine.read_voices(root)
    voice = next((v for v in voices if v["id"] == params["voice_id"]), None)
    if not voice or params["language"] not in model["languages"]:
        raise WorkerError("SYNTHESIS_VOICE_UNAVAILABLE")
    data = engine.adapter(params, model, voice, directory)
    return validate_audio(data, params)


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
            raw = stream.read(200001)
        if len(raw) > 200000:
            raise WorkerError("SYNTHESIS_LIMIT")
        data = run(json.loads(raw), path.parent)
        result = {"ok": True, "data": data}
    except WorkerError as error:
        result = {"ok": False, "code": error.code}
    except (ImportError, ModuleNotFoundError, importlib.metadata.PackageNotFoundError):
        result = {"ok": False, "code": "MODEL_RUNTIME_MISSING"}
    except Exception:
        result = {"ok": False, "code": "MODEL_INFERENCE_FAILED"}
    atomic_json(path.parent / "result.json", result)


if __name__ == "__main__":
    main()
