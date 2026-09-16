"""Pinned SDK synthesis in a cancellable offline child; never clone or download."""
from __future__ import annotations

import importlib.metadata
import json
import os
import sys
import wave
from pathlib import Path

from runtime.errors import WorkerError
from runtime.model_result import atomic_json
from runtime.offline import deny_network_and_children
from speech.synthesis.contracts import GAP, MAX_FRAMES, RATE, parse_options, validate_audio
from speech.synthesis.models import SDK_VERSION, read_voices, verify_bundle


def run(job: dict, directory: Path) -> dict:
    params, model = parse_options(job['params']), job['model']
    verify_bundle(model)
    if importlib.metadata.version('vieneu') != SDK_VERSION:
        raise WorkerError('SYNTHESIS_RUNTIME_VERSION')
    import numpy as np
    from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine
    from vieneu_utils.phonemize_text import phonemize_text_with_emotions

    root = Path(model['directory'])
    voices = read_voices(root)
    voice = next((v for v in voices if v['id'] == params['voice_id']), None)
    if not voice or params['language'] not in model['languages']:
        raise WorkerError('SYNTHESIS_VOICE_UNAVAILABLE')
    engine = OnnxV3LiteEngine(checkpoint_path=str(root), onnx_dir=str(root / 'onnx'),
                             codec_dir=str(root / 'codec'), onnx_subfolder='onnx_update', threads=2)
    if engine.SAMPLE_RATE != RATE or engine.device.type != 'cpu':
        raise WorkerError('SYNTHESIS_RUNTIME_VERSION')
    speaker = np.asarray(voice['speaker_emb'], dtype=np.float32)
    reference = np.asarray(voice['ref_codes'], dtype=np.int64)
    if reference.shape[1] != engine.n_vq:
        raise WorkerError('SYNTHESIS_VOICES_INVALID')
    frames, segments = 0, []
    with wave.open(str(directory / 'speech.wav'), 'wb') as output:
        output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        for cue in params['cues']:
            # Use the SDK's bilingual normalizer; language is an explicit admission/
            # provenance declaration, not an invented language argument or accent lock.
            phonemes = phonemize_text_with_emotions(cue['text'])
            tokens = engine.tokenizer.encode(phonemes, add_special_tokens=False).ids
            if not tokens or len(tokens) > 512:
                raise WorkerError('SYNTHESIS_TOKEN_LIMIT')
            audio = np.asarray(engine.infer(phonemes=phonemes, text=cue['text'], speaker_emb=speaker,
                ref_codes=reference, use_ref_codes=True, temperature=0.8, top_k=25, top_p=0.95,
                max_new_frames=750, repetition_penalty=1.2, frame_cap=True))
            if (audio.ndim != 1 or audio.dtype.kind not in 'fi' or not 1 <= audio.size < RATE * 60
                    or not np.isfinite(audio).all() or not np.any(np.abs(audio) > 1e-6)):
                raise WorkerError('MODEL_OUTPUT_INVALID')
            start = frames + (GAP if segments else 0)
            if start + audio.size > MAX_FRAMES:
                raise WorkerError('SYNTHESIS_LIMIT')
            if segments:
                output.writeframesraw(bytes(GAP * 2))
            # Standard saturating PCM16 quantization, no time stretch or cue truncation.
            pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2')
            if not np.any(pcm):
                raise WorkerError('MODEL_OUTPUT_INVALID')
            output.writeframesraw(pcm.tobytes())
            frames = start + int(audio.size)
            segments.append({'cue_id': cue['id'], 'start_frame': start, 'end_frame': frames})
            atomic_json(directory / 'progress.json', {'completed': len(segments), 'total': len(params['cues'])})
    verify_bundle(model)
    runtime = ';'.join(f'{name}@{importlib.metadata.version(name)}' for name in ('vieneu', 'onnxruntime', 'numpy', 'sea-g2p'))
    return validate_audio({'frames': frames, 'segments': segments, 'runtime': runtime}, params)


def main() -> None:
    path = Path(sys.argv[1])
    try:
        os.environ.update(HF_HUB_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TRANSFORMERS_OFFLINE='1',
                          OMP_NUM_THREADS='2', OPENBLAS_NUM_THREADS='2', MKL_NUM_THREADS='2')
        sys.addaudithook(deny_network_and_children)
        with path.open('rb') as stream:
            raw = stream.read(200001)
        if len(raw) > 200000:
            raise WorkerError('SYNTHESIS_LIMIT')
        data = run(json.loads(raw), path.parent)
        result = {'ok': True, 'data': data}
    except WorkerError as error:
        result = {'ok': False, 'code': error.code}
    except (ImportError, ModuleNotFoundError, importlib.metadata.PackageNotFoundError):
        result = {'ok': False, 'code': 'MODEL_RUNTIME_MISSING'}
    except Exception:
        result = {'ok': False, 'code': 'MODEL_INFERENCE_FAILED'}
    atomic_json(path.parent / 'result.json', result)


if __name__ == '__main__':
    main()
