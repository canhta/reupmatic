import array
import hashlib
import math
import os
import shutil
import subprocess
import tempfile
import unittest
import uuid
import wave
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
            "duck": {"enabled": False, "amount_db": 18, "release_ms": 250},
            "muted": False,
        }

    def tearDown(self):
        self.session.close()
        self.temp.cleanup()

    def render(self, **params):
        return self.session.call(
            "media.process",
            {
                "asset_id": self.source,
                "encoding": "review",
                "processing": {"editing": {"speed": 1}},
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

    def test_same_size_mtime_audio_changes_cannot_reuse_cached_output(self):
        self.render()
        info = self.audio.stat()
        data = bytearray(self.audio.read_bytes())
        data[-2000:-1000] = bytes(1000)
        self.audio.write_bytes(data)
        os.utime(self.audio, ns=(info.st_atime_ns, info.st_mtime_ns))
        with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
            self.render()

    def test_a_soundtrack_without_the_required_duck_field_is_refused(self):
        without_duck = {key: value for key, value in self.track.items() if key != "duck"}
        with self.assertRaisesRegex(RuntimeError, "INVALID_REQUEST|INVALID_SOUNDTRACK"):
            self.render(soundtrack=without_duck)

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
            processing={"editing": {"audio": {"muted": True, "gain_db": 0}}},
        )
        self.assertGreater(self.level(mixed["path"], 1), self.level(muted["path"], 1) * 1.3)
        self.assertGreater(self.level(mixed["path"], 3.5), 0.04)
        self.assertLess(self.level(muted["path"], 3.5), 0.001)
        self.assertTrue(muted["has_audio"])

    def test_plain_renderer_supports_soundtrack_and_fades(self):
        track = {**self.track, "offset_ms": 0, "fade_in_ms": 700, "fade_out_ms": 700}
        result = self.session.call(
            "media.render",
            {"asset_id": self.source, "encoding": "review", "soundtrack": track},
        )
        self.assertLess(
            self.level(result["path"], 0.01, 0.1), self.level(result["path"], 0.8, 0.1) * 0.2
        )
        self.assertLess(
            self.level(result["path"], 1.85, 0.1), self.level(result["path"], 0.8, 0.1) * 0.3
        )
        self.assertEqual(result["duration_ms"], 4000)

    def voice_asset(self, *, sample_rate=48000, gaps=(0, 0)):
        # Two-tone WAV whose internal spacing is unrelated to the planned line offsets.
        seconds = 0.6
        frames = int(seconds * sample_rate)
        gap_frames = [int(gap / 1000 * sample_rate) for gap in gaps]
        chunks = []
        for index, gap in enumerate(gap_frames):
            chunks.append(bytes(gap * 2))
            chunks.append(
                array.array(
                    "h",
                    [
                        int(
                            12000
                            * math.sin(2 * math.pi * (600 if index == 0 else 900) * t / sample_rate)
                        )
                        for t in range(frames)
                    ],
                ).tobytes()
            )
        data = b"".join(chunks)
        path = self.root / f"voice-{uuid.uuid4().hex}.wav"
        with wave.open(str(path), "wb") as sink:
            sink.setnchannels(1)
            sink.setsampwidth(2)
            sink.setframerate(sample_rate)
            sink.writeframes(data)
        registered = self.session.call("asset.register", {"path": str(path), "kind": "audio"})
        return {
            "asset_id": registered["asset_id"],
            "sha256": registered["sha256"],
            "sample_rate": sample_rate,
            "mode": "replace",
            "gain_db": 0,
            "fade_in_ms": 0,
            "fade_out_ms": 0,
            "muted": False,
            "lines": [
                {"offset_ms": 0, "rate": 1, "start_frame": 0, "end_frame": frames},
                {
                    "offset_ms": 2400,
                    "rate": 1,
                    "start_frame": frames + gap_frames[1],
                    "end_frame": frames * 2 + gap_frames[1],
                },
            ],
        }

    def test_voice_lines_play_at_their_planned_offsets_not_the_recordings_spacing(self):
        voice = self.voice_asset(gaps=(0, 1000))
        result = self.session.call(
            "media.render",
            {
                "asset_id": self.source,
                "encoding": "review",
                "voice": voice,
            },
        )
        self.assertTrue(result["has_audio"])
        self.assertEqual(result["duration_ms"], 4000)
        self.assertGreater(self.level(result["path"], 0.1, 0.3), 0.04)
        self.assertGreater(self.level(result["path"], 2.5, 0.3), 0.04)
        self.assertLess(self.level(result["path"], 1.6, 0.3), 0.001)
        self.assertLess(self.level(result["path"], 3.5, 0.3), 0.001)

    def test_changing_the_recordings_internal_gaps_cannot_move_a_line(self):
        short = self.voice_asset(gaps=(0, 200))
        long = self.voice_asset(gaps=(0, 3000))
        for voice in (short, long):
            result = self.session.call(
                "media.render",
                {"asset_id": self.source, "encoding": "review", "voice": voice},
            )
            self.assertGreater(self.level(result["path"], 2.5, 0.3), 0.04)
            self.assertLess(self.level(result["path"], 1.7, 0.3), 0.001)

    def test_voice_mixes_with_music_and_can_replace_original_audio(self):
        voice = {**self.voice_asset(), "mode": "mix"}
        track = {**self.track, "mode": "replace", "offset_ms": 0, "end_ms": 3000}
        both = self.session.call(
            "media.render",
            {
                "asset_id": self.source,
                "encoding": "review",
                "voice": voice,
                "soundtrack": track,
            },
        )
        self.assertGreater(self.level(both["path"], 2.5, 0.3), 0.04)
        self.assertGreater(self.level(both["path"], 1.0, 0.3), 0.04)
        self.assertEqual(both["duration_ms"], 4000)

    def test_ducking_lowers_the_music_while_the_voice_plays(self):
        voice = {**self.voice_asset(), "mode": "mix"}
        track = {
            **self.track,
            "mode": "mix",
            "offset_ms": 0,
            "end_ms": 3000,
            "fade_in_ms": 0,
            "fade_out_ms": 0,
        }
        ducked = {**track, "duck": {**track["duck"], "enabled": True}}
        music_only = self.session.call(
            "media.render",
            {"asset_id": self.source, "encoding": "review", "soundtrack": track},
        )
        voice_only = self.session.call(
            "media.render",
            {"asset_id": self.source, "encoding": "review", "voice": voice},
        )
        plain = self.session.call(
            "media.render",
            {
                "asset_id": self.source,
                "encoding": "review",
                "soundtrack": track,
                "voice": voice,
            },
        )
        duck = self.session.call(
            "media.render",
            {
                "asset_id": self.source,
                "encoding": "review",
                "soundtrack": ducked,
                "voice": voice,
            },
        )

        def music_level(result, start, duration=0.3):
            # Isolate music RMS by subtracting the voice branch's independent power from the mix.
            total = self.level(result["path"], start, duration)
            spoken = self.level(voice_only["path"], start, duration)
            return math.sqrt(max(0.0, total * total - spoken * spoken))

        voice_window, rest_window = 0.1, 1.5
        self.assertGreater(self.level(voice_only["path"], voice_window, 0.3), 0.04)
        self.assertLess(self.level(voice_only["path"], rest_window, 0.3), 0.001)
        self.assertLess(music_level(duck, voice_window), music_level(plain, voice_window) * 0.5)
        self.assertAlmostEqual(
            music_level(duck, rest_window), music_level(plain, rest_window), delta=0.005
        )
        self.assertAlmostEqual(
            music_level(plain, rest_window),
            self.level(music_only["path"], rest_window, 0.3),
            delta=0.005,
        )
        self.assertNotEqual(duck["sha256"], plain["sha256"])

    def test_unknown_voice_asset_is_refused(self):
        voice = self.voice_asset()
        with self.assertRaisesRegex(RuntimeError, "ASSET_KIND|INVALID_REQUEST|SOURCE_CHANGED"):
            self.session.call(
                "media.render",
                {
                    "asset_id": self.source,
                    "encoding": "review",
                    "voice": {**voice, "sha256": "c" * 64},
                },
            )

    def test_muted_music_lane_is_absent_from_the_mix(self):
        result = self.render(soundtrack={**self.track, "muted": True, "mode": "replace"})
        self.assertFalse(result["has_audio"])
        self.assertEqual(result["duration_ms"], 4000)

    def test_muted_voice_lane_is_absent_from_the_mix(self):
        voice = {**self.voice_asset(), "mode": "replace", "muted": True}
        result = self.session.call(
            "media.render",
            {
                "asset_id": self.source,
                "encoding": "review",
                "voice": voice,
            },
        )
        self.assertFalse(result["has_audio"])
