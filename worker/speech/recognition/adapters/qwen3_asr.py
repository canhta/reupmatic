"""Qwen3-ASR adapter: local transformers-backend inference, offline only."""

from __future__ import annotations

import importlib.metadata
from types import SimpleNamespace

# Qwen3-ASR's own language table uses canonical capitalized names, not ISO codes.
LANGUAGE_NAMES = {"en": "English", "vi": "Vietnamese", "zh": "Chinese"}


def transcribe(job: dict) -> dict:
    import torch
    from qwen_asr import Qwen3ASRModel

    aligner = job.get("aligner")
    kwargs = dict(
        device_map="cpu",
        dtype=torch.float32,
        local_files_only=True,
        max_inference_batch_size=1,
        max_new_tokens=1024,
    )
    if aligner is not None:
        kwargs["forced_aligner"] = aligner["directory"]
        kwargs["forced_aligner_kwargs"] = dict(
            device_map="cpu", dtype=torch.float32, local_files_only=True
        )
    model = Qwen3ASRModel.from_pretrained(job["model"]["directory"], **kwargs)
    results = model.transcribe(
        audio=job["audio"],
        language=LANGUAGE_NAMES[job["language"]],
        return_time_stamps=aligner is not None,
    )
    duration = (job["end_ms"] - job["start_ms"]) / 1000
    time_stamps = results[0].time_stamps if aligner is not None else None
    words = (
        [
            {"text": item.text, "start": item.start_time, "end": item.end_time}
            for item in time_stamps
        ]
        if time_stamps is not None
        else []
    )
    segments = [SimpleNamespace(start=0.0, end=duration, text=results[0].text or "", words=words)]
    runtime = ";".join(
        f"{name}@{importlib.metadata.version(name)}" for name in ("qwen-asr", "torch")
    )
    return {
        "segments": segments,
        "runtime": runtime,
        "aligner_model_id": aligner["model_id"] if aligner is not None else None,
    }
