"""CONTROLLED SDK doubles only; generated sine waves do NOT prove speech quality."""

import hashlib
import json
from pathlib import Path

FILES = [
    "onnx/" + name
    for name in (
        "vieneu_prefill.onnx",
        "vieneu_decode_step.onnx",
        "vieneu_acoustic_cached.onnx",
        "vieneu_backbone_shared.data",
        "vieneu_v3_heads.npz",
        "config.json",
        "tokenizer.json",
    )
]
FILES += [
    "codec/moss_audio_tokenizer_decode_full.onnx",
    "codec/moss_audio_tokenizer_decode_shared.data",
]

SDK = """from types import SimpleNamespace
from pathlib import Path
import os, time, socket
import numpy as np
class OnnxV3LiteEngine:
    SAMPLE_RATE = 48000
    def __init__(self, **kwargs):
        self.root = Path(kwargs['checkpoint_path'])
        assert kwargs == dict(checkpoint_path=str(self.root), onnx_dir=str(self.root/'onnx'),
            codec_dir=str(self.root/'codec'), onnx_subfolder='onnx_update', threads=2)
        assert os.environ['HF_HUB_OFFLINE'] == '1'
        self.device = SimpleNamespace(type='cpu')
        self.n_vq = 8
        self.tokenizer = SimpleNamespace(encode=lambda text, **kw: SimpleNamespace(ids=list(range(513))
            if os.environ.get('SYNTH_TEST_TOKEN') else [1,2,3]))
    def infer(self, **kwargs):
        assert set(kwargs) == {'phonemes','text','speaker_emb','ref_codes','use_ref_codes','temperature',
            'top_k','top_p','max_new_frames','repetition_penalty','frame_cap'}
        assert kwargs['speaker_emb'].shape == (192,) and kwargs['ref_codes'].shape == (2,8)
        assert kwargs['max_new_frames'] == 750 and kwargs['frame_cap'] is True
        if os.environ.get('SYNTH_TEST_NETWORK'): socket.getaddrinfo('example.invalid', 443)
        if os.environ.get('SYNTH_TEST_CHILD'):
            import subprocess
            subprocess.run(['echo','NOT ALLOWED'])
        if os.environ.get('SYNTH_TEST_SLOW'):
            Path(os.environ['SYNTH_TEST_PID']).write_text(str(os.getpid()))
            time.sleep(30)
        if os.environ.get('SYNTH_TEST_HASH'):
            (self.root/'onnx/vieneu_prefill.onnx').write_bytes(b'MODIFIED')
        mode = os.environ.get('SYNTH_TEST_AUDIO')
        if mode == 'empty': return np.zeros(0)
        if mode == 'silent': return np.zeros(100)
        if mode == 'quiet': return np.full(100, 0.00001)
        if mode == 'nan': return np.array([np.nan])
        if mode == 'shape': return np.ones((2,100))
        if mode == 'long': return np.ones(48000*60)
        return (.1*np.sin(np.arange(4800)*.1)).astype(np.float32)
"""


def bundle(root: Path) -> tuple[Path, Path]:
    directory = root / "mô hình"
    directory.mkdir()
    for name in FILES:
        path = directory / name
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(b"CONTROLLED TEST WEIGHTS - NOT A REAL MODEL")
    (directory / "voices.json").write_text(
        json.dumps(
            {
                "version": 1,
                "voices": [
                    {
                        "id": "test-voice",
                        "label": "Controlled voice",
                        "speaker_emb": [0.5] * 192,
                        "ref_codes": [[1] * 8] * 2,
                    }
                ],
            }
        )
    )
    manifest = root / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "version": 1,
                "engine": "vieneu-v3-turbo-onnx",
                "directory": str(directory),
                "languages": ["en", "vi"],
                "files": {
                    name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
                    for name in FILES + ["voices.json"]
                },
            }
        )
    )
    return manifest, directory


def sdk(root: Path) -> Path:
    directory = root / "controlled-sdk"
    directory.mkdir()
    for name, version in [
        ("vieneu", "3.7.1"),
        ("onnxruntime", "0.0.0"),
        ("sea_g2p", "0.0.0"),
        ("tokenizers", "0.0.0"),
    ]:
        pkg = directory / name
        pkg.mkdir()
        (pkg / "__init__.py").write_text("")
        info = directory / f"{name}-{version}.dist-info"
        info.mkdir()
        (info / "METADATA").write_text(
            f"Metadata-Version: 2.1\nName: {name.replace('_', '-')}\nVersion: {version}\n"
        )
    engine = directory / "vieneu/_v3_turbo_engine"
    engine.mkdir()
    (engine / "__init__.py").write_text("")
    (engine / "onnx_runtime_lite.py").write_text(SDK)
    utils = directory / "vieneu_utils"
    utils.mkdir()
    (utils / "__init__.py").write_text("")
    (utils / "phonemize_text.py").write_text(
        "def phonemize_text_with_emotions(text): return text\n"
    )
    return directory


def params(model_id: str) -> dict:
    return {
        "source_layer": "spoken",
        "source_token": "spoken-12345678",
        "model_id": model_id,
        "voice_id": "test-voice",
        "language": "vi",
        "cues": [
            {"id": "cue-1", "text": "Xin chào", "start_ms": 1000, "end_ms": 2000},
            {"id": "cue-2", "text": "Thế giới", "start_ms": 9000, "end_ms": 15000},
        ],
    }
