"""VieNeu v3 Turbo clone encoder: a reference clip becomes the adapter's `voice` dict."""

from __future__ import annotations

from pathlib import Path

from runtime.errors import WorkerError


def _reference_rows(value: object) -> list[list[int]]:
    try:
        return [[int(entry) for entry in row] for row in value]  # type: ignore[union-attr]
    except (TypeError, ValueError):
        raise WorkerError("SYNTHESIS_CLONE_INVALID") from None


def encode(root: Path, audio: Path, denoise: bool = True) -> dict:
    import numpy as np
    from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine

    engine = OnnxV3LiteEngine(
        checkpoint_path=str(root),
        onnx_dir=str(root / "onnx"),
        codec_dir=str(root / "codec"),
        onnx_subfolder="onnx_update",
        threads=2,
    )
    if engine.device.type != "cpu":
        raise WorkerError("SYNTHESIS_RUNTIME_VERSION")
    # The SDK's clone path returns ``(speaker_emb, ref_codes)``, mirroring a preset's payload.
    speaker, reference = engine.prepare_reference(str(audio), denoise=denoise)
    if speaker is None or reference is None:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    return {
        "speaker_emb": np.asarray(speaker, dtype=np.float32).reshape(-1).tolist(),
        "ref_codes": _reference_rows(np.asarray(reference).tolist()),
    }
