"""S1/S2 fixture: real FFmpeg frames with controlled, noisy OCR doubles.

A black video burns one line in at known frame times. The controlled OCR only reports text when the
frame is bright and injects a one-character misread, so the test pins both the frame-accurate
boundary refinement (S1) and the robust merging (S2). Recognition quality is not certified here.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from test_worker import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))

FFMPEG = os.environ.get("FFMPEG_PATH", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE_PATH", "ffprobe")


def _has_drawtext() -> bool:
    try:
        result = subprocess.run(
            [FFMPEG, "-hide_banner", "-filters"], capture_output=True, text=True, check=True
        )
    except (OSError, subprocess.CalledProcessError):
        return False
    return " drawtext " in result.stdout


HAS_NATIVE = bool(
    _has_drawtext() and importlib.util.find_spec("numpy") and importlib.util.find_spec("cv2")
)

FRAME_MS = 1000 / 24
TEXT_START_MS = 1000
TEXT_END_MS = 2000

RAPIDOCR = """from types import SimpleNamespace
import numpy as np

_calls = 0

class RapidOCR:
    def __init__(self, params):
        assert params['Global.use_cls'] is False

    def __call__(self, image, **kwargs):
        global _calls
        array = np.asarray(image)
        if array.size == 0 or int(array.max()) < 128:
            return SimpleNamespace(boxes=None, txts=None, scores=None)
        _calls += 1
        text = 'HELL0' if _calls == 4 else 'HELLO'
        return SimpleNamespace(
            boxes=[[[16, 36], [140, 36], [140, 64], [16, 64]]], txts=[text], scores=[0.9]
        )
"""


class SubtitleSyncFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="subtitle-sync-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        sdk = self.root / "controlled-sdk"
        (sdk / "rapidocr/utils").mkdir(parents=True)
        (sdk / "rapidocr/utils/__init__.py").write_text("")
        (sdk / "rapidocr/utils/typings.py").write_text(
            "EngineType = LangRec = ModelType = OCRVersion = str\n"
        )
        (sdk / "rapidocr/__init__.py").write_text(RAPIDOCR)
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
        manifest.write_text(json.dumps({"ocr": {"en": entry}}))
        self.env = {
            **os.environ,
            "REUPMATIC_MODEL_MANIFEST": str(manifest),
            "PYTHONPATH": str(sdk),
        }
        self.video = self.root / "burned-in.mp4"
        subprocess.run(
            [
                FFMPEG,
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=black:s=160x90:r=24:d=3",
                "-vf",
                "drawtext=text='HELLO':fontsize=20:fontcolor=white:x=20:y=40:"
                "enable='between(t,1,2)'",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-an",
                "-n",
                str(self.video),
            ],
            check=True,
        )
        self.sessions = []

    def tearDown(self):
        for session in self.sessions:
            session.close()
        self.temp.cleanup()

    def session(self):
        session = Session(self.workspace, env=self.env)
        self.sessions.append(session)
        aid = session.call("asset.register", {"path": str(self.video), "kind": "video"})["asset_id"]
        return session, aid


@unittest.skipUnless(HAS_NATIVE, "native FFmpeg + NumPy/OpenCV required")
class FrameAccurateSyncTests(SubtitleSyncFixture):
    def test_one_cue_with_frame_accurate_boundaries_despite_a_misread(self):
        session, aid = self.session()
        data = session.call(
            "media.ocr.extract",
            {
                "asset_id": aid,
                "start_ms": 0,
                "end_ms": 3000,
                "language": "en",
                "sample_ms": 500,
                "min_confidence": 0.5,
            },
            revision=3,
        )
        self.assertEqual(len(data["cues"]), 1)
        cue = data["cues"][0]
        self.assertEqual(cue["text"], "HELLO")
        self.assertLessEqual(abs(cue["start_ms"] - TEXT_START_MS), FRAME_MS)
        self.assertLessEqual(abs(cue["end_ms"] - TEXT_END_MS), FRAME_MS)

    def test_ocr_evidence_is_persisted_without_publishing_media(self):
        session, aid = self.session()
        data = session.call(
            "media.ocr.extract",
            {
                "asset_id": aid,
                "start_ms": 0,
                "end_ms": 3000,
                "language": "en",
                "sample_ms": 500,
                "min_confidence": 0.5,
            },
        )
        summary = self.workspace / "analyses" / data["analysis_id"] / "summary.json"
        self.assertTrue(summary.exists())
        self.assertEqual(list((self.workspace / "renders").glob("*.mp4")), [])


@unittest.skipUnless(HAS_NATIVE, "native FFmpeg + NumPy/OpenCV required")
class RefinementCostTests(unittest.TestCase):
    def test_refinement_time_cost_per_minute_of_video(self):
        from vision.merge import CueGrouper
        from vision.refine import refine_groups

        with tempfile.TemporaryDirectory(prefix="refine-cost-") as directory:
            root = Path(directory)
            video = root / "minute.mp4"
            subprocess.run(
                [
                    FFMPEG,
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=black:s=320x180:r=24:d=60",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-an",
                    "-n",
                    str(video),
                ],
                check=True,
            )
            # A typical density: one original line every two seconds, so 30 boundaries a minute.
            # Every frame also carries a persistent banner; the subtitle row must be refined alone.
            grouper = CueGrouper()
            step = 2000
            for index in range(30):
                start = index * step
                for offset, text in ((0, "Text"), (500, "Text")):
                    grouper.add(
                        {
                            "start_ms": start + offset,
                            "end_ms": start + offset + 500,
                            "detections": [
                                {"text": text, "confidence": 0.9, "box": [40, 100, 280, 150]},
                                {"text": "Banner", "confidence": 0.9, "box": [10, 10, 60, 25]},
                            ],
                        }
                    )
                grouper.add({"start_ms": start + 1000, "end_ms": start + 1500, "detections": []})
            groups = grouper.finish()

            class Process:
                def run(self, req, args, timeout=None, on_poll=None):
                    return subprocess.run(args, check=True, capture_output=True, text=True).stdout

            host = SimpleNamespace(
                ffmpeg=FFMPEG,
                ffprobe=FFPROBE,
                workspace=root,
                process=Process(),
            )
            stats = refine_groups(host, {"id": "cost"}, video, 320, 180, groups)
            minute_cost = stats["elapsed_ms"]
            from vision.merge import summarize

            region = summarize(groups[0].first)[2]
            print(
                f"\nS1 refinement: {len(groups)} cues, {stats['decoded_frames']} frames, "
                f"{minute_cost} ms per 60 s of video at 24 fps, "
                f"region {region[2] - region[0]}x{region[3] - region[1]}"
            )
            self.assertGreater(stats["decoded_frames"], 0)
            self.assertLess(minute_cost, 20000)
