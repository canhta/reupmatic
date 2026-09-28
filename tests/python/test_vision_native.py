"""Real NDJSON/Python/FFmpeg with controlled SDK doubles; no accuracy certification."""

from __future__ import annotations

import json
import subprocess
import sys
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

    def test_changed_weight_fails_closed_before_any_output(self):
        s, aid = self.session()
        (self.root / "fixture.onnx").write_bytes(b"changed")
        with self.assertRaisesRegex(RuntimeError, "MODEL_HASH_MISMATCH"):
            s.call(
                "media.ocr.extract",
                {
                    "asset_id": aid,
                    "start_ms": 0,
                    "end_ms": 1000,
                    "language": "en",
                    "sample_ms": 500,
                    "min_confidence": 0.5,
                },
            )
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
