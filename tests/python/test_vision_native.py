"""Real NDJSON/Python/FFmpeg with controlled SDK doubles; no accuracy certification."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
import unittest
from pathlib import Path

from vision_fixture import HAS_NATIVE, VisionFixture


@unittest.skipUnless(HAS_NATIVE, "native FFmpeg + optional NumPy/OpenCV required")
class ControlledVisionPipelineTests(VisionFixture, unittest.TestCase):
    def test_controlled_ocr_extraction_returns_timed_cues_and_persisted_evidence(self):
        s, aid = self.session()
        data = s.call(
            "media.ocr.extract",
            {
                "asset_id": aid,
                "start_ms": 0,
                "end_ms": 1000,
                "language": "en",
                "sample_ms": 500,
                "min_confidence": 0.5,
            },
            revision=9,
        )
        self.assertEqual(data["scope"], "full-source")
        self.assertEqual(
            [(c["start_ms"], c["end_ms"], c["text"]) for c in data["cues"]],
            [(0, 1000, "Fixture OCR")],
        )
        self.assertEqual(len(data["observations"]), 2)
        self.assertEqual(data["source_sha256"], self.source_hash)
        saved = json.loads(
            (self.workspace / "analyses" / data["analysis_id"] / "summary.json").read_text()
        )
        self.assertEqual(saved["observations"], data["observations"])

    def test_controlled_lama_exports_actual_mp4_with_audio_without_touching_original(self):
        import numpy as np

        s, aid = self.session()
        data = s.call("media.inpaint", self.inpaint(aid))
        self.assertTrue(Path(data["path"]).is_file())
        self.assertEqual(data["duration_ms"], 1000)
        self.assertTrue(data["has_audio"])
        self.assertEqual(data["processed_frames"], 24)
        self.assertEqual(data["masked_frames"], 24)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.source_hash)
        raw = subprocess.check_output(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                data["path"],
                "-frames:v",
                "1",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "-threads",
                "1",
                "-",
            ]
        )
        frame = np.frombuffer(raw, dtype=np.uint8).reshape(90, 160, 3)
        self.assertLess(abs(float(frame[30, 80].mean()) - 180), 8)
        self.assertLess(float(frame[0, 0].mean()), 8)

    def test_controlled_automatic_mask_uses_per_frame_text_without_review(self):
        s, aid = self.session()
        data = s.call("media.inpaint", self.inpaint(aid, "text"))
        self.assertEqual(data["masked_frames"], 24)
        self.assertEqual(set(data["model_fingerprints"]), {"ocr", "inpainting"})

    def test_cancel_reaps_inference_child_and_publishes_no_output(self):
        s, aid = self.session(slow=True)
        rid = s.send("media.inpaint", self.inpaint(aid))
        while True:
            message = s.messages.get(timeout=20)
            s.events.append(message)
            if message["id"] != rid:
                continue
            if message["event"] == "error":
                self.fail(str(message))
            if message["event"] == "progress" and (message["data"].get("fraction") or 0) > 0:
                break
        started = time.monotonic()
        self.assertTrue(s.call("cancel", {"request_id": rid})["requested"])
        self.assertEqual(s.wait(rid)["data"]["code"], "CANCELLED")
        self.assertLess(time.monotonic() - started, 5)
        self.assertEqual(list((self.workspace / "renders").glob("*.mp4")), [])
        self.assertEqual(list(self.workspace.glob("vision-*")), [])
        self.assertTrue(s.call("hello", {})["ffmpeg"])

    def test_changed_weight_fails_closed_before_any_output(self):
        s, aid = self.session()
        (self.root / "fixture.onnx").write_bytes(b"changed")
        with self.assertRaisesRegex(RuntimeError, "MODEL_HASH_MISMATCH"):
            s.call("media.inpaint", self.inpaint(aid))
        self.assertEqual(list((self.workspace / "renders").glob("*.mp4")), [])
        self.assertTrue(s.call("hello", {})["ffmpeg"])


class OfflineRunnerTests(unittest.TestCase):
    def test_python_network_attempt_is_denied_before_dns_or_connection(self):
        root = Path(__file__).resolve().parents[2]
        script = """import sys,socket
from vision.runner import deny_network_and_children
from runtime.errors import WorkerError
sys.addaudithook(deny_network_and_children)
try:
    socket.create_connection(('example.invalid',443),timeout=1)
except WorkerError as e:
    print(e.code)
"""
        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=root / "worker",
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(result.stdout.strip(), "MODEL_NETWORK_DISABLED")
