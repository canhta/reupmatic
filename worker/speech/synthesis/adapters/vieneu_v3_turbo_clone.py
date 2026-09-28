"""VieNeu v3 Turbo clone encoder: a reference clip becomes the adapter's `voice` dict."""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

from runtime.errors import WorkerError

_BASE_CODEC = ("moss_audio_tokenizer_decode_full.onnx", "moss_audio_tokenizer_decode_shared.data")
_CLONE_CODEC = ("moss_audio_tokenizer_encode.onnx", "moss_audio_tokenizer_encode.data")


def _reference_rows(value: object) -> list[list[int]]:
    try:
        return [[int(entry) for entry in row] for row in value]  # type: ignore[union-attr]
    except (TypeError, ValueError):
        raise WorkerError("SYNTHESIS_CLONE_INVALID") from None


def _link_or_copy(source: Path, target: Path) -> None:
    """Hardlink when the two bundles share a filesystem, else copy; never across the network."""
    if not source.is_file():
        raise WorkerError("SYNTHESIS_CLONE_UNAVAILABLE")
    try:
        os.link(source, target)
    except OSError:
        try:
            shutil.copy2(source, target)
        except OSError:
            raise WorkerError("SYNTHESIS_CLONE_UNAVAILABLE") from None


def _composed_codec(base: Path, clone: Path, target: Path) -> None:
    """One codec dir the engine can open: the base decoder plus the add-on encoder."""
    target.mkdir()
    for name in _BASE_CODEC:
        _link_or_copy(base / "codec" / name, target / name)
    for name in _CLONE_CODEC:
        _link_or_copy(clone / "codec" / name, target / name)


def _require(directory: Path, names: tuple[str, ...], code: str) -> None:
    if any(not (directory / name).is_file() for name in names):
        raise WorkerError(code)


def encode(base: Path, clone: Path, audio: Path, denoise: bool = True) -> dict:
    # Check every artifact before importing or constructing the engine: a missing file must be a
    # named code, never the SDK's silent Hugging Face fallback.
    _require(base / "onnx", ("vieneu_prefill.onnx",), "MODEL_MISSING")
    _require(base / "codec", _BASE_CODEC, "MODEL_MISSING")
    _require(clone, ("speaker_encoder.onnx", "denoiser.onnx"), "SYNTHESIS_CLONE_UNAVAILABLE")
    _require(clone / "codec", _CLONE_CODEC, "SYNTHESIS_CLONE_UNAVAILABLE")
    import numpy as np
    from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine

    with tempfile.TemporaryDirectory() as scratch:
        codec = Path(scratch) / "codec"
        _composed_codec(base, clone, codec)
        engine = OnnxV3LiteEngine(
            checkpoint_path=str(clone),
            onnx_dir=str(base / "onnx"),
            codec_dir=str(codec),
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
