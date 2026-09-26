"""faster-whisper adapter: local CTranslate2 CPU/int8 inference, offline only."""

from __future__ import annotations

import importlib.metadata

from runtime.errors import WorkerError


def transcribe(job: dict) -> dict:
    from faster_whisper import WhisperModel

    model = WhisperModel(
        job["model"]["directory"],
        device="cpu",
        compute_type="int8",
        cpu_threads=2,
        num_workers=1,
        local_files_only=True,
    )
    if job["language"] != "en" and not model.model.is_multilingual:
        raise WorkerError("MODEL_LANGUAGE_UNAVAILABLE")
    segments, info = model.transcribe(
        job["audio"],
        language=job["language"],
        task="transcribe",
        beam_size=5,
        temperature=0,
        condition_on_previous_text=False,
        word_timestamps=True,
        vad_filter=False,
    )
    if info.language != job["language"]:
        raise WorkerError("MODEL_LANGUAGE_UNAVAILABLE")
    runtime = ";".join(
        f"{name}@{importlib.metadata.version(name)}" for name in ("faster-whisper", "ctranslate2")
    )
    return {"segments": segments, "runtime": runtime}
