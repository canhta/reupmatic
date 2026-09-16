"""One cancellable inference child. No downloaded models or executable plugin hooks."""

from __future__ import annotations

import importlib.metadata
import json
import os
import sys
from pathlib import Path

from runtime.errors import WorkerError
from runtime.model_result import atomic_json
from runtime.offline import deny_network_and_children
from speech.recognition.models import verify_bundle
from speech.recognition.timestamps import timed_segments


def make_recognizer(directory: str):
    from faster_whisper import WhisperModel

    return WhisperModel(
        directory,
        device="cpu",
        compute_type="int8",
        cpu_threads=2,
        num_workers=1,
        local_files_only=True,
    )


def run(job: dict, progress: Path) -> dict:
    verify_bundle(job["model"])
    model = make_recognizer(job["model"]["directory"])
    if job["language"] != "en" and not model.model.is_multilingual:
        raise WorkerError("MODEL_LANGUAGE_UNAVAILABLE")
    segments, info = model.transcribe(
        job["audio"],
        language=job["language"],
        task="transcribe",
        beam_size=5,
        temperature=0,
        condition_on_previous_text=False,
        word_timestamps=False,
        vad_filter=False,
    )
    if info.language != job["language"]:
        raise WorkerError("MODEL_LANGUAGE_UNAVAILABLE")
    duration = job["end_ms"] - job["start_ms"]
    cues = timed_segments(
        segments,
        job["start_ms"],
        job["end_ms"],
        lambda completed: atomic_json(
            progress, {"completed_ms": completed, "duration_ms": duration}
        ),
    )
    verify_bundle(job["model"])
    runtime = ";".join(
        f"{name}@{importlib.metadata.version(name)}" for name in ("faster-whisper", "ctranslate2")
    )
    return {"cues": cues, "runtime": runtime}


def main() -> None:
    job_path = Path(sys.argv[1])
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
        job = json.loads(job_path.read_text(encoding="utf-8"))
        data = run(job, job_path.parent / "progress.json")
        result = {"ok": True, "data": data}
        if len(json.dumps(result, ensure_ascii=False).encode()) > 1000000:
            raise WorkerError("SPEECH_RESULT_TOO_LARGE")
    except WorkerError as error:
        result = {"ok": False, "code": error.code}
    except (ImportError, ModuleNotFoundError, importlib.metadata.PackageNotFoundError):
        result = {"ok": False, "code": "MODEL_RUNTIME_MISSING"}
    except Exception:
        result = {"ok": False, "code": "MODEL_INFERENCE_FAILED"}
    atomic_json(job_path.parent / "result.json", result)


if __name__ == "__main__":
    main()
