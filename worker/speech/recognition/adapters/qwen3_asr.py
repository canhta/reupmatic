"""Qwen3-ASR adapter: local transformers-backend inference, offline only.

Reviewed against the `qwen-asr` package source (Apache-2.0), not invented; the review's
dated primary-source list and its limits are recorded with the adapter.

Unlike faster-whisper, the base Qwen3-ASR model produces no internal
segmentation on its own — `Qwen3ASRModel.transcribe()` returns exactly one
`(language, text)` pair per input audio, with per-word/character timestamps
available only through the separate `Qwen3-ForcedAligner` model. This adapter
therefore always returns one segment spanning the whole requested range; the
engine boundary is the whole range, not a guess. `speech.recognition.runner`
is the piece that knows this engine returns no segments of its own
(`EngineDescriptor.provides_segments`) and derives several cues from the word
timings; this adapter neither splits nor claims to.

When `job["aligner"]` names a configured, hash-verified
`qwen3-forced-aligner` bundle (attached by `speech.recognition.service`, only
when this engine was the one requested), it is threaded into
`Qwen3ASRModel.from_pretrained(forced_aligner=..., forced_aligner_kwargs=...)`
and `transcribe(..., return_time_stamps=True)` is used instead, per the
`qwen-asr` 0.0.6 source. Its
`ASRTranscription.time_stamps` — a `ForcedAlignResult` of
`ForcedAlignItem(text, start_time, end_time)` in seconds relative to the
whole input audio, or `None` for empty text — becomes this segment's `words`,
which `timestamps.timed_segments` turns into ordered, cue-bounded word
timings without touching the recognised text, cue count or cue boundaries.
Without an aligner, `words` stays empty and `return_time_stamps` stays
`False`, exactly ticket 03's original behaviour.
"""

from __future__ import annotations

import importlib.metadata
from types import SimpleNamespace

# Qwen3-ASR's own `SUPPORTED_LANGUAGES` table (qwen_asr/inference/utils.py)
# uses canonical capitalized English names, not ISO codes. This is the only
# mapping this adapter needs: which language a *configured bundle* may serve
# is already checked, before any engine runs, by `SpeechEngines.require()`
# against the manifest's own `languages` list.
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
