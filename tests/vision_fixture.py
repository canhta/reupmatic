"""Real NDJSON/Python/FFmpeg with controlled external SDK doubles.

These tests do NOT certify RapidOCR accuracy, actual ONNX compatibility or LaMa
quality. The fixture modules exist only in per-test temporary directories.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from test_worker import Session

HAS_NATIVE = bool(
    shutil.which("ffmpeg")
    and shutil.which("ffprobe")
    and importlib.util.find_spec("numpy")
    and importlib.util.find_spec("cv2")
)


class VisionFixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="vision-native-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        sdk = self.root / "controlled-sdk"
        (sdk / "rapidocr/utils").mkdir(parents=True)
        (sdk / "rapidocr/utils/__init__.py").write_text("")
        (sdk / "rapidocr/utils/typings.py").write_text(
            "EngineType = LangRec = ModelType = OCRVersion = str\n"
        )
        (sdk / "rapidocr/__init__.py").write_text("""from types import SimpleNamespace
class RapidOCR:
    def __init__(self, params):
        assert params['Global.use_cls'] is False
        assert params['Rec.rec_keys_path']
    def __call__(self, image, **kwargs):
        return SimpleNamespace(boxes=[[[20,20],[80,20],[80,40],[20,40]]],
                               txts=['Fixture OCR'], scores=[.95])
""")
        (sdk / "onnxruntime.py").write_text("""from types import SimpleNamespace
import os
import time
import numpy as np
class SessionOptions: pass
class InferenceSession:
    def __init__(self,*args,**kwargs): self.calls=0
    def get_inputs(self):
        return [SimpleNamespace(name='image',shape=[1,3,512,512],type='tensor(float)'),
                SimpleNamespace(name='mask',shape=[1,1,512,512],type='tensor(float)')]
    def run(self,outputs,feed):
        self.calls += 1
        if self.calls > 1 and os.environ.get('CONTROLLED_VISION_DELAY') == '1': time.sleep(2)
        return [np.full((1,3,512,512),180,dtype=np.float32)]
""")
        model = self.root / "fixture.onnx"
        model.write_bytes(b"CONTROLLED TEST ARTIFACT. NOT MODEL WEIGHTS.")
        artifact = {"path": str(model), "sha256": hashlib.sha256(model.read_bytes()).hexdigest()}
        entry = {
            "det": artifact,
            "rec": artifact,
            "keys": artifact,
            "det_version": "PP-OCRv4",
            "rec_version": "PP-OCRv4",
            "rec_height": 48,
        }
        manifest = self.root / "manifest.json"
        manifest.write_text(
            json.dumps({"version": 1, "ocr": {"en": entry}, "inpainting": {"model": artifact}})
        )
        self.env = {**os.environ, "REUPMATIC_MODEL_MANIFEST": str(manifest), "PYTHONPATH": str(sdk)}
        self.source = self.root / "video nguồn.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=black:s=160x90:r=24:d=1",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=600:duration=1",
                "-c:v",
                "libx264",
                "-threads",
                "2",
                "-c:a",
                "aac",
                "-shortest",
                "-n",
                str(self.source),
            ],
            check=True,
        )
        self.source_hash = hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.sessions = []

    def tearDown(self):
        for session in self.sessions:
            session.close()
        self.temp.cleanup()

    def session(self, slow=False):
        env = {**self.env, "CONTROLLED_VISION_DELAY": "1" if slow else "0"}
        session = Session(self.workspace, env=env)
        self.sessions.append(session)
        aid = session.call("asset.register", {"path": str(self.source), "kind": "video"})[
            "asset_id"
        ]
        return session, aid

    def inpaint(self, aid, target="manual"):
        p = {"asset_id": aid, "start_ms": 0, "end_ms": 1000, "target": target, "padding_px": 0}
        p.update(
            {"region": {"x": 0.25, "y": 0.2, "width": 0.5, "height": 0.4}}
            if target == "manual"
            else {"language": "en"}
        )
        return p
