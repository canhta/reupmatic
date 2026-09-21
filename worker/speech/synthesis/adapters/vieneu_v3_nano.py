"""VieNeu v3 Nano ONNX adapter: the engine is asked for a target duration per line.

Unlike v3 Turbo, this architecture has a duration predictor and a `speed` control, so
it can own the fit. For each cue `run` measures the model's own natural length at
`speed=1`; when that speech is longer than the cue's slot (the distance to the next
cue's start, or the cue's own end for the last line), it asks the engine again with
`speed = natural / target` and the duration predictor resynthesises to the slot. No
host-side time stretch or truncation is ever applied — `SynthesisEngine.targets_duration`
is `True` for it, so the voice timing plan leaves every rate factor at unity.

The target is the same slot the plan computes, expressed in this engine's own frames.
When natural speech already fits, it is kept untouched: a line is never slowed down to
fill its slot.
"""

from __future__ import annotations

import importlib.metadata
import wave
from pathlib import Path

from runtime.errors import WorkerError
from runtime.model_result import atomic_json
from speech.synthesis.contracts import GAP_MS, MAX_CUE_SECONDS, MAX_SECONDS, SAMPLE_RATES


def _target_frames(cues: list[dict], index: int, rate: int) -> int:
    cue = cues[index]
    end_ms = cues[index + 1]["start_ms"] if index + 1 < len(cues) else cue["end_ms"]
    return max(0, end_ms - cue["start_ms"]) * rate // 1000


def run(params: dict, model: dict, voice: dict, directory: Path) -> dict:
    import numpy as np
    from vieneu.v3nano import OnnxV3NanoEngine
    from vieneu_utils.phonemize_text import phonemize_text_with_emotions

    root = Path(model["directory"])
    engine = OnnxV3NanoEngine(local_dir=str(root), threads=2)
    if engine.device.type != "cpu":
        raise WorkerError("SYNTHESIS_RUNTIME_VERSION")
    rate = engine.SAMPLE_RATE
    if type(rate) is not int or rate not in SAMPLE_RATES:
        raise WorkerError("SYNTHESIS_SAMPLE_RATE_UNSUPPORTED")
    gap = rate * GAP_MS // 1000
    speaker = np.asarray(voice["speaker_emb"], dtype=np.float32)
    style = np.asarray(voice["style"], dtype=np.float32)
    cues = params["cues"]
    frames, segments = 0, []
    with wave.open(str(directory / "speech.wav"), "wb") as output:
        output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        for index, cue in enumerate(cues):
            phonemes = phonemize_text_with_emotions(cue["text"])
            audio = np.asarray(
                engine.infer(
                    phonemes=phonemes,
                    speaker_emb=speaker,
                    ref_codes=style,
                    steps=16,
                    cfg=3.0,
                    speed=1.0,
                )
            )
            target = _target_frames(cues, index, rate)
            # Only compress when the model's natural speech exceeds the slot; the engine's
            # own duration predictor owns the fit, so no host-side stretch is applied.
            if target > 0 and audio.size > target:
                audio = np.asarray(
                    engine.infer(
                        phonemes=phonemes,
                        speaker_emb=speaker,
                        ref_codes=style,
                        steps=16,
                        cfg=3.0,
                        speed=audio.size / target,
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
                {"completed": len(segments), "total": len(cues)},
            )
    runtime = ";".join(
        f"{name}@{importlib.metadata.version(name)}" for name in ("vieneu", "onnxruntime", "numpy")
    )
    return {"frames": frames, "sample_rate": rate, "segments": segments, "runtime": runtime}
