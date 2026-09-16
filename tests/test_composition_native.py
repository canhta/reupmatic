"""Real FFmpeg montage checks, without model/recognition doubles."""

import array
import copy
import hashlib
import math
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_worker import Session


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class CompositionNativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="composition-native-")
        cls.root = Path(cls.temp.name)
        cls.first, cls.second = cls.root / "nguồn ' red.mp4", cls.root / "blue.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=red:s=320x180:r=30:d=3",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=48000:duration=3",
                "-c:v",
                "libx264",
                "-threads",
                "2",
                "-c:a",
                "aac",
                "-shortest",
                "-n",
                str(cls.first),
            ],
            check=True,
        )
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=blue:s=180x320:r=24:d=3",
                "-c:v",
                "libx264",
                "-threads",
                "2",
                "-an",
                "-n",
                str(cls.second),
            ],
            check=True,
        )
        cls.originals = {
            path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (cls.first, cls.second)
        }

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.workspace = Path(tempfile.mkdtemp(dir=self.root))
        self.session = Session(self.workspace)
        self.sources = []
        for path in (self.first, self.second):
            asset = self.session.call("asset.register", {"path": str(path), "kind": "video"})
            info = self.session.call("media.probe", {"asset_id": asset["asset_id"]})
            self.sources.append(
                {
                    "asset_id": asset["asset_id"],
                    "sha256": asset["sha256"],
                    "duration_ms": info["duration_ms"],
                }
            )
        self.document = {
            "version": 1,
            "canvas": {"width": 320, "height": 180, "fps": 30},
            "clips": [
                {
                    "id": "red-clip",
                    "source": self.sources[0],
                    "start_ms": 500,
                    "end_ms": 2500,
                    "speed": 1,
                },
                {
                    "id": "blue-clip",
                    "source": self.sources[1],
                    "start_ms": 500,
                    "end_ms": 2500,
                    "speed": 2,
                },
            ],
        }

    def tearDown(self):
        self.session.close()
        self.assertFalse(list(self.workspace.glob("composition-*")))
        for path, digest in self.originals.items():
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest)

    def render(self, **kwargs):
        params = {
            "asset_id": self.sources[0]["asset_id"],
            "mode": "full",
            "encoding": "review",
            "composition": self.document,
            **kwargs,
        }
        return self.session.call(
            "media.process" if "processing" in params else "media.render", params
        )

    def pixel(self, filename, second):
        data = subprocess.check_output(
            [
                "ffmpeg",
                "-v",
                "error",
                "-ss",
                str(second),
                "-i",
                filename,
                "-vf",
                "crop=2:2:158:88,format=rgb24",
                "-frames:v",
                "1",
                "-f",
                "rawvideo",
                "-",
            ]
        )
        return tuple(data[:3])

    def rms(self, filename, second, duration=0.25):
        data = subprocess.check_output(
            [
                "ffmpeg",
                "-v",
                "error",
                "-ss",
                str(second),
                "-i",
                filename,
                "-t",
                str(duration),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "48000",
                "-f",
                "f32le",
                "-",
            ]
        )
        samples = array.array("f", data)
        return math.sqrt(sum(value * value for value in samples) / max(1, len(samples)))

    def test_mixed_dimensions_rates_audio_and_clip_order_are_encoded(self):
        result = self.render()
        self.assertAlmostEqual(result["duration_ms"], 3000, delta=40)
        self.assertEqual((result["width"], result["height"]), (320, 180))
        self.assertGreater(self.pixel(result["path"], 0.5)[0], 200)
        self.assertGreater(self.pixel(result["path"], 2.5)[2], 200)
        self.assertGreater(self.rms(result["path"], 0.5), 0.03)
        self.assertLess(self.rms(result["path"], 2.5), 0.001)
        cached = self.render()
        self.assertTrue(cached["cache_hit"])
        self.document["clips"].reverse()
        reversed_result = self.render()
        self.assertNotEqual(result["artifact_id"], reversed_result["artifact_id"])
        self.assertGreater(self.pixel(reversed_result["path"], 0.5)[2], 200)

    def test_sample_straddles_cut_and_materializes_only_its_interval(self):
        result = self.render(mode="sample", start_ms=1500, end_ms=2500)
        self.assertAlmostEqual(result["duration_ms"], 1000, delta=40)
        self.assertGreater(self.pixel(result["path"], 0.2)[0], 200)
        self.assertGreater(self.pixel(result["path"], 0.8)[2], 200)
        self.assertGreater(self.rms(result["path"], 0.1), 0.03)
        self.assertLess(self.rms(result["path"], 0.7), 0.001)
        intermediates = list((self.workspace / "renders").glob("*/output.mkv"))
        self.assertEqual(len(intermediates), 1)
        asset = self.session.call(
            "asset.register", {"path": str(intermediates[0]), "kind": "video"}
        )
        info = self.session.call("media.probe", {"asset_id": asset["asset_id"]})
        self.assertAlmostEqual(info["duration_ms"], 1000, delta=40)

    def test_global_trim_speed_and_source_audio_use_the_composition_clock(self):
        result = self.render(
            mode="sample",
            start_ms=1000,
            end_ms=3000,
            processing={
                "version": 1,
                "editing": {"trim": {"start_ms": 500, "end_ms": 2500}, "speed": 0.5},
            },
        )
        self.assertAlmostEqual(result["duration_ms"], 3000, delta=80)
        self.assertGreater(self.pixel(result["path"], 0.5)[0], 200)
        self.assertGreater(self.pixel(result["path"], 2.5)[2], 200)
        self.assertGreater(self.rms(result["path"], 0.5), 0.03)
        self.assertLess(self.rms(result["path"], 2.5), 0.001)

    def test_captions_burn_on_composition_time_for_late_sample(self):
        subtitle = self.workspace / "sample.srt"
        subtitle.write_text("1\n00:00:02,100 --> 00:00:02,700\nCaption on blue\n", encoding="utf-8")
        asset = self.session.call("asset.register", {"path": str(subtitle), "kind": "subtitle"})
        plain = self.render(mode="sample", start_ms=2000, end_ms=3000)
        captioned = self.render(
            mode="sample", start_ms=2000, end_ms=3000, subtitle_id=asset["asset_id"]
        )

        def frame(path):
            return subprocess.check_output(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-ss",
                    "0.4",
                    "-i",
                    path,
                    "-frames:v",
                    "1",
                    "-pix_fmt",
                    "rgb24",
                    "-f",
                    "rawvideo",
                    "-",
                ]
            )

        self.assertNotEqual(frame(plain["path"]), frame(captioned["path"]))

    def test_replacement_audio_sample_uses_global_output_offset_and_fades(self):
        soundtrack = self.root / "music.wav"
        if not soundtrack.exists():
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=880:sample_rate=48000:duration=5",
                    "-n",
                    str(soundtrack),
                ],
                check=True,
            )
        asset = self.session.call("asset.register", {"path": str(soundtrack), "kind": "audio"})
        track = {
            "asset_id": asset["asset_id"],
            "sha256": asset["sha256"],
            "mode": "replace",
            "start_ms": 0,
            "end_ms": 4000,
            "offset_ms": 500,
            "gain_db": 0,
            "fade_in_ms": 1000,
            "fade_out_ms": 500,
        }
        processing = {
            "version": 1,
            "editing": {"trim": {"start_ms": 500, "end_ms": 3000}, "speed": 0.5},
        }
        full = self.render(processing=processing, soundtrack=track)
        sample = self.render(
            mode="sample", start_ms=1000, end_ms=2500, processing=processing, soundtrack=track
        )
        self.assertAlmostEqual(sample["duration_ms"], 3000, delta=80)
        # Sample starts one second into the final edited full output, halfway through the music fade.
        self.assertAlmostEqual(
            self.rms(full["path"], 1.2), self.rms(sample["path"], 0.2), delta=0.003
        )
        self.assertAlmostEqual(
            self.rms(full["path"], 3.2), self.rms(sample["path"], 2.2), delta=0.003
        )
        self.assertGreater(self.rms(sample["path"], 2.2), 0.03)

    def test_fractional_clip_durations_share_one_frame_grid(self):
        self.document["clips"] = [
            {
                "id": f"cut-{index}",
                "source": self.sources[index % 2],
                "start_ms": 111,
                "end_ms": 412,
                "speed": 1,
            }
            for index in range(12)
        ]
        result = self.render()
        self.assertAlmostEqual(result["duration_ms"], 3612, delta=40)
        self.assertGreater(self.pixel(result["path"], 0.1)[0], 200)
        self.assertGreater(self.pixel(result["path"], 0.4)[2], 200)

    def test_validation_and_cancel_do_not_poison_next_request(self):
        invalid = copy.deepcopy(self.document)
        invalid["clips"][1]["source"]["sha256"] = "c" * 64
        with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
            self.render(composition=invalid)
        invalid = copy.deepcopy(self.document)
        invalid["clips"][1]["source"]["duration_ms"] = 10000
        with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
            self.render(composition=invalid, mode="sample", start_ms=0, end_ms=500)
        request = self.session.send(
            "media.render",
            {
                "asset_id": self.sources[0]["asset_id"],
                "mode": "full",
                "encoding": "review",
                "composition": self.document,
            },
        )
        self.session.call("cancel", {"request_id": request})
        self.assertEqual(self.session.wait(request)["data"]["code"], "CANCELLED")
        self.assertAlmostEqual(self.render()["duration_ms"], 3000, delta=40)
