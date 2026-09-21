"""VieNeu v3 Turbo ONNX adapter: natural-rate synthesis, the host owns the fit.

This architecture cannot be asked to produce a target duration, so `run` synthesises
every cue at the model's natural speed and records the frame span it actually produced.
`speech.synthesis.models.SynthesisEngine.targets_duration` is `False` for it, which is
what makes the voice timing plan carry a host-side rate factor for its jobs. Nothing
here time-stretches or truncates audio; the plan and the mixing stage decide what to do
with the measured spans.
"""

from __future__ import annotations

import importlib.metadata
import wave
from pathlib import Path

from runtime.errors import WorkerError
from runtime.model_result import atomic_json
from speech.synthesis.contracts import GAP_MS, MAX_CUE_SECONDS, MAX_SECONDS, SAMPLE_RATES


def run(params: dict, model: dict, voice: dict, directory: Path) -> dict:
    import numpy as np
    from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine
    from vieneu_utils.phonemize_text import phonemize_text_with_emotions

    root = Path(model["directory"])
    engine = OnnxV3LiteEngine(
        checkpoint_path=str(root),
        onnx_dir=str(root / "onnx"),
        codec_dir=str(root / "codec"),
        onnx_subfolder="onnx_update",
        threads=2,
    )
    if engine.device.type != "cpu":
        raise WorkerError("SYNTHESIS_RUNTIME_VERSION")
    rate = engine.SAMPLE_RATE
    if type(rate) is not int or rate not in SAMPLE_RATES:
        raise WorkerError("SYNTHESIS_SAMPLE_RATE_UNSUPPORTED")
    gap = rate * GAP_MS // 1000
    speaker = np.asarray(voice["speaker_emb"], dtype=np.float32)
    reference = np.asarray(voice["ref_codes"], dtype=np.int64)
    if reference.shape[1] != engine.n_vq:
        raise WorkerError("SYNTHESIS_VOICES_INVALID")
    frames, segments = 0, []
    with wave.open(str(directory / "speech.wav"), "wb") as output:
        output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        for cue in params["cues"]:
            # Use the SDK's bilingual normalizer; language is an explicit admission/
            # provenance declaration, not an invented language argument or accent lock.
            phonemes = phonemize_text_with_emotions(cue["text"])
            tokens = engine.tokenizer.encode(phonemes, add_special_tokens=False).ids
            if not tokens or len(tokens) > 512:
                raise WorkerError("SYNTHESIS_TOKEN_LIMIT")
            audio = np.asarray(
                engine.infer(
                    phonemes=phonemes,
                    text=cue["text"],
                    speaker_emb=speaker,
                    ref_codes=reference,
                    use_ref_codes=True,
                    temperature=0.8,
                    top_k=25,
                    top_p=0.95,
                    max_new_frames=750,
                    repetition_penalty=1.2,
                    frame_cap=True,
                )
            )
            if (
                audio.ndim != 1
                or audio.dtype.kind not in "fi"
                or not 1 <= audio.size < rate * MAX_CUE_SECONDS
                or not np.isfinite(audio).all()
                or not np.any(np.abs(audio) > 1e-6)
            ):
                raise WorkerError("MODEL_OUTPUT_INVALID")
            lead = gap if segments else 0
            start = frames + lead
            if start + audio.size > rate * MAX_SECONDS:
                raise WorkerError("SYNTHESIS_LIMIT")
            if lead:
                output.writeframesraw(bytes(lead * 2))
            # Standard saturating PCM16 quantization, no time stretch or cue truncation.
            pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
            if not np.any(pcm):
                raise WorkerError("MODEL_OUTPUT_INVALID")
            output.writeframesraw(pcm.tobytes())
            frames = start + int(audio.size)
            segments.append(
                {
                    "cue_id": cue["id"],
                    "start_frame": start,
                    "end_frame": frames,
                    "lead_silence_frames": lead,
                }
            )
            atomic_json(
                directory / "progress.json",
                {"completed": len(segments), "total": len(params["cues"])},
            )
    runtime = ";".join(
        f"{name}@{importlib.metadata.version(name)}"
        for name in ("vieneu", "onnxruntime", "numpy", "sea-g2p")
    )
    return {"frames": frames, "sample_rate": rate, "segments": segments, "runtime": runtime}
