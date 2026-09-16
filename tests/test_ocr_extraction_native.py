"""Actual worker/FFmpeg flow with controlled OCR SDK, not recognition quality."""

import hashlib
import json
import subprocess
import unittest

from vision_fixture import HAS_NATIVE, VisionFixture


@unittest.skipUnless(HAS_NATIVE, "FFmpeg and NumPy/OpenCV are required")
class OcrExtractionNativeTests(VisionFixture, unittest.TestCase):
    def params(self, aid, duration=1000):
        return {
            "asset_id": aid,
            "start_ms": 0,
            "end_ms": duration,
            "language": "en",
            "sample_ms": 2000,
            "min_confidence": 0.5,
        }

    def test_whole_source_exceeds_sample_limit_merges_cues_and_retains_raw_evidence(self):
        self.source.unlink()
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=black:s=160x90:r=6:d=121",
                "-c:v",
                "libx264",
                "-threads",
                "2",
                "-an",
                "-n",
                str(self.source),
            ],
            check=True,
        )
        original = hashlib.sha256(self.source.read_bytes()).hexdigest()
        session, aid = self.session()
        result = session.call("media.ocr.extract", self.params(aid, 121000))
        self.assertEqual(result["scope"], "full-source")
        self.assertEqual(result["end_ms"], 121000)
        self.assertEqual(result["evidence"]["chunks"], 2)
        self.assertEqual(
            result["cues"],
            [{"id": "ocr-000001", "start_ms": 0, "end_ms": 121000, "text": "Fixture OCR"}],
        )
        directory = self.workspace / "analyses" / result["analysis_id"]
        self.assertEqual(json.loads((directory / "summary.json").read_text()), result)
        chunks = json.loads((directory / "chunks.json").read_text())
        observations = sum(
            len(json.loads((directory / chunk["file"]).read_text())["observations"])
            for chunk in chunks
        )
        self.assertEqual(observations, result["evidence"]["observation_count"])
        self.assertEqual(len(result["observations"]), 20)
        self.assertFalse(list(self.workspace.glob("ocr-extract-*")))
        self.assertFalse(list(self.workspace.glob("vision-*")))
        self.assertFalse(list((self.workspace / "renders").iterdir()))
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), original)

    def test_full_scan_rejects_partial_range_without_publishing(self):
        session, aid = self.session()
        with self.assertRaisesRegex(RuntimeError, "INVALID_REQUEST"):
            session.call("media.ocr.extract", {**self.params(aid), "start_ms": 100})
        with self.assertRaisesRegex(RuntimeError, "INVALID_REQUEST"):
            session.call("media.ocr.extract", self.params(aid, 500))
        self.assertFalse((self.workspace / "analyses").exists())
        result = session.call("media.ocr.extract", {**self.params(aid), "sample_ms": 500})
        self.assertEqual(result["cues"][0]["text"], "Fixture OCR")
