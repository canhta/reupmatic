"""Editing is exercised against real FFmpeg; no AI model or SDK double is used."""

import array
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_worker import Session


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required")
class EditingNativeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="editing-native-")
        self.root = Path(self.temp.name)
        self.source = self.root / "source.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=320x180:r=30:d=4",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=4",
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
        self.original = hashlib.sha256(self.source.read_bytes()).hexdigest()
        self.session = Session(self.root / "workspace")
        self.asset = self.session.call(
            "asset.register", {"path": str(self.source), "kind": "video"}
        )["asset_id"]

    def tearDown(self):
        self.session.close()
        self.temp.cleanup()

    def render(self, editing, **params):
        processing = {"version": 1, "editing": editing}
        self.assertEqual(self.session.call("models.resolve", {"processing": processing}), {})
        return self.session.call(
            "media.process",
            {
                "asset_id": self.asset,
                "mode": "full",
                "encoding": "review",
                "processing": processing,
                "model_fingerprints": {},
                **params,
            },
        )

    def test_trim_speed_crop_portrait_and_mute_are_encoded_and_cached(self):
        editing = {
            "trim": {"start_ms": 500, "end_ms": 2500},
            "speed": 2,
            "crop": {"x": 0.25, "y": 0, "width": 0.5, "height": 1},
            "flip": "horizontal",
            "audio": {"muted": True, "gain_db": 0},
            "color": {"brightness": 0.1, "contrast": 1.1, "saturation": 0.8},
            "output": {"aspect": "9:16", "fit": "contain", "height": 480},
        }
        result = self.render(editing)
        self.assertEqual(result["duration_ms"], 1000)
        self.assertFalse(result["has_audio"])
        probe = json.loads(
            subprocess.check_output(
                ["ffprobe", "-v", "error", "-show_streams", "-of", "json", result["path"]]
            )
        )
        self.assertEqual((probe["streams"][0]["width"], probe["streams"][0]["height"]), (270, 480))
        cached = self.render(editing)
        self.assertTrue(cached["cache_hit"])
        self.assertEqual(cached["sha256"], result["sha256"])
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.original)
        self.assertFalse(list((self.root / "workspace").glob("processing-*")))

    def test_audio_gain_and_sample_intersection_share_source_timing(self):
        editing = {
            "trim": {"start_ms": 500, "end_ms": 2500},
            "speed": 0.5,
            "audio": {"muted": False, "gain_db": 0},
        }
        result = self.render(editing, mode="sample", start_ms=1000, end_ms=3000)
        quieter = self.render(
            {**editing, "audio": {"muted": False, "gain_db": -6}},
            mode="sample",
            start_ms=1000,
            end_ms=3000,
        )
        self.assertEqual(result["duration_ms"], 3000)
        self.assertTrue(result["has_audio"])

        def rms(filename):
            data = array.array(
                "f",
                subprocess.check_output(
                    [
                        "ffmpeg",
                        "-v",
                        "error",
                        "-i",
                        filename,
                        "-map",
                        "0:a:0",
                        "-ac",
                        "1",
                        "-f",
                        "f32le",
                        "-",
                    ]
                ),
            )
            return math.sqrt(sum(value * value for value in data) / len(data))

        self.assertAlmostEqual(
            rms(quieter["path"]) / rms(result["path"]), 10 ** (-6 / 20), delta=0.04
        )
        self.assertNotEqual(result["sha256"], quieter["sha256"])

    def test_invalid_edit_does_not_publish_or_poison_following_jobs(self):
        with self.assertRaisesRegex(RuntimeError, "EDIT_EMPTY_RANGE"):
            self.render(
                {"trim": {"start_ms": 2000, "end_ms": 3000}}, mode="sample", start_ms=0, end_ms=1000
            )
        with self.assertRaisesRegex(RuntimeError, "EDIT_SOURCE_RANGE"):
            self.render({"trim": {"start_ms": 0, "end_ms": 8000}})
        self.assertFalse(list((self.root / "workspace" / "renders").glob("*/output.mp4")))
        self.assertTrue(self.render({"speed": 1})["has_audio"])

    def test_subtitles_follow_source_time_before_speed_change(self):
        subtitles = self.root / "captions.srt"
        subtitles.write_text(
            "1\n00:00:01,500 --> 00:00:02,000\nVISIBLE CAPTION\n", encoding="utf-8"
        )
        sid = self.session.call("asset.register", {"path": str(subtitles), "kind": "subtitle"})[
            "asset_id"
        ]
        editing = {"trim": {"start_ms": 1000, "end_ms": 3000}, "speed": 2}
        plain = self.render(editing)
        captioned = self.render(editing, subtitle_id=sid)

        def frame(filename, time):
            return subprocess.check_output(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-i",
                    filename,
                    "-ss",
                    str(time),
                    "-frames:v",
                    "1",
                    "-pix_fmt",
                    "rgb24",
                    "-f",
                    "rawvideo",
                    "-threads",
                    "1",
                    "-",
                ]
            )

        def difference(time):
            first, second = frame(plain["path"], time), frame(captioned["path"], time)
            return sum(abs(a - b) for a, b in zip(first, second)) / len(first)

        self.assertGreater(difference(0.35), difference(0.1) + 0.15)
        self.assertEqual(captioned["duration_ms"], 1000)
