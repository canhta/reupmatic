"""Qwen3-ForcedAligner stub adapter: a companion engine, never a primary target.

The forced aligner only produces word timings when paired with a target
transcript: `speech.recognition.adapters.qwen3_asr` threads a configured
aligner bundle straight into
`Qwen3ASRModel.from_pretrained(forced_aligner=<directory>, forced_aligner_kwargs=...)`
and then requests `transcribe(..., return_time_stamps=True)` (reviewed
against the `qwen-asr` 0.0.6 source — byte-identical to the GitHub `main`
sdist at review time). There is no audio-only alignment target for a
bare `speech.transcribe` request naming this engine's own `model_id`
directly, so that request is refused plainly here rather than attempted.
`speech.recognition.service.transcribe` never builds such a request itself:
it only ever resolves this engine as a companion to `qwen3-asr`.
"""

from __future__ import annotations

from runtime.errors import WorkerError


def transcribe(job: dict) -> dict:
    raise WorkerError("MODEL_RUNTIME_MISSING")
