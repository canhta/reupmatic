"""Qwen3-ForcedAligner stub adapter: a companion engine, never a primary target."""

from __future__ import annotations

from runtime.errors import WorkerError


def transcribe(job: dict) -> dict:
    raise WorkerError("MODEL_RUNTIME_MISSING")
