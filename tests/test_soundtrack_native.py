import array
import hashlib
import math
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_worker import Session


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class SoundtrackNativeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="soundtrack-native-")
        self.root = Path(self.temp.name)
        self.video = self.root / "video.mp4"
        self.audio = self.root / "music.wav"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=s=160x90:r=24:d=4",
                "-c:v",
                "libx264",
                "-threads",
                "2",
                str(self.video),
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
                "sine=frequency=880:duration=3",
                "-c:a",
                "pcm_s16le",
                str(self.audio),
            ],
            check=True,
        )
        self.session = Session(self.root / "workspace")
        self.source = self.session.call(
            "asset.register", {"path": str(self.video), "kind": "video"}
        )["asset_id"]
        registered = self.session.call("asset.register", {"path": str(self.audio), "kind": "audio"})
        self.track = {
            "asset_id": registered["asset_id"],
            "sha256": registered["sha256"],
            "mode": "replace",
            "start_ms": 0,
            "end_ms": 2000,
            "offset_ms": 1000,
            "gain_db": 0,
            "fade_in_ms": 100,
            "fade_out_ms": 100,
        }

    def tearDown(self):
        self.session.close()
        self.temp.cleanup()

    def render(self, **params):
        return self.session.call(
            "media.process",
            {
                "asset_id": self.source,
                "mode": "full",
                "encoding": "review",
                "processing": {"version": 1, "editing": {"speed": 1}},
                "soundtrack": self.track,
                **params,
            },
        )

    def level(self, filename, start, duration=0.25):
        data = array.array(
            "f",
            subprocess.check_output(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-ss",
                    str(start),
                    "-i",
                    filename,
                    "-t",
                    str(duration),
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
        return math.sqrt(sum(sample * sample for sample in data) / max(1, len(data)))

    def test_replace_pads_silence_preserves_duration_and_cache_identity(self):
        original = hashlib.sha256(self.audio.read_bytes()).hexdigest()
        result = self.render()
        self.assertTrue(result["has_audio"])
        self.assertEqual(result["duration_ms"], 4000)
        self.assertLess(self.level(result["path"], 0.2), 0.001)
        self.assertGreater(self.level(result["path"], 1.4), 0.04)
        self.assertLess(self.level(result["path"], 3.5), 0.001)
        self.assertTrue(self.render()["cache_hit"])
        quieter = self.render(soundtrack={**self.track, "gain_db": -12})
        self.assertNotEqual(result["sha256"], quieter["sha256"])
        self.assertAlmostEqual(
            self.level(quieter["path"], 1.4) / self.level(result["path"], 1.4),
            10 ** (-12 / 20),
            delta=0.04,
        )
        self.assertEqual(hashlib.sha256(self.audio.read_bytes()).hexdigest(), original)

    def test_sample_uses_output_clock_after_trim_and_speed(self):
        processing = {
            "version": 1,
            "editing": {"trim": {"start_ms": 1000, "end_ms": 4000}, "speed": 2},
        }
        full = self.render(processing=processing)
        sample = self.render(processing=processing, mode="sample", start_ms=3000, end_ms=4000)
        self.assertEqual(sample["duration_ms"], 500)
        self.assertLess(self.level(full["path"], 0.2), 0.001)
        self.assertGreater(self.level(sample["path"], 0.2, 0.2), 0.04)

    def test_same_size_mtime_audio_changes_cannot_reuse_cached_output(self):
        self.render()
        info = self.audio.stat()
        data = bytearray(self.audio.read_bytes())
        data[-2000:-1000] = bytes(1000)
        self.audio.write_bytes(data)
        os.utime(self.audio, ns=(info.st_atime_ns, info.st_mtime_ns))
        with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
            self.render()

    def test_out_of_range_audio_fails_without_publishing(self):
        with self.assertRaisesRegex(RuntimeError, "INVALID_SOUNDTRACK"):
            self.render(soundtrack={**self.track, "end_ms": 10000})
        self.assertFalse(list((self.root / "workspace" / "renders").glob("*/output.mp4")))
        self.assertTrue(self.render()["has_audio"])

    def test_mix_contains_both_sources_while_muting_only_suppresses_original(self):
        audible = self.root / "audible.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(self.video),
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=4",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                str(audible),
            ],
            check=True,
        )
        self.source = self.session.call("asset.register", {"path": str(audible), "kind": "video"})[
            "asset_id"
        ]
        track = {**self.track, "mode": "mix", "offset_ms": 0, "end_ms": 3000}
        mixed = self.render(soundtrack=track)
        muted = self.render(
            soundtrack=track,
            processing={"version": 1, "editing": {"audio": {"muted": True, "gain_db": 0}}},
        )
        self.assertGreater(self.level(mixed["path"], 1), self.level(muted["path"], 1) * 1.3)
        self.assertGreater(self.level(mixed["path"], 3.5), 0.04)
        self.assertLess(self.level(muted["path"], 3.5), 0.001)
        self.assertTrue(muted["has_audio"])

    def test_plain_renderer_supports_soundtrack_and_fades(self):
        track = {**self.track, "offset_ms": 0, "fade_in_ms": 700, "fade_out_ms": 700}
        result = self.session.call(
            "media.render",
            {"asset_id": self.source, "mode": "full", "encoding": "review", "soundtrack": track},
        )
        self.assertLess(
            self.level(result["path"], 0.01, 0.1), self.level(result["path"], 0.8, 0.1) * 0.2
        )
        self.assertLess(
            self.level(result["path"], 1.85, 0.1), self.level(result["path"], 0.8, 0.1) * 0.3
        )
        self.assertEqual(result["duration_ms"], 4000)
