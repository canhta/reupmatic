"""Native media integration with controlled doubles; not real-model quality."""

import importlib.util
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

from vision_fixture import HAS_NATIVE, VisionFixture

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from subtitles.style import DEFAULT_STYLE


@unittest.skipUnless(HAS_NATIVE, "FFmpeg and NumPy/OpenCV required")
class ProcessingNativeTests(VisionFixture, unittest.TestCase):
    def recipe(self):
        return {
            "subtitle_style": {
                **DEFAULT_STYLE,
                "box_opacity": 1,
                "cover": {
                    "x_pct": 0,
                    "y_pct": 70,
                    "width_pct": 100,
                    "height_pct": 30,
                    "color": "#000000",
                    "opacity": 1,
                },
            },
        }

    def request(self, aid, **extra):
        return {
            "asset_id": aid,
            "encoding": "review",
            "processing": self.recipe(),
            **extra,
        }

    def frame(self, filename, offset):
        import numpy as np

        raw = subprocess.check_output(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                filename,
                "-ss",
                str(offset),
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
        return np.frombuffer(raw, dtype=np.uint8).reshape(90, 160, 3)

    def test_cover_band_renders_over_the_full_video_and_cache_identity_is_stable(self):
        session, aid = self.session()
        recipe = {
            "subtitle_style": {
                **DEFAULT_STYLE,
                "cover": {
                    "x_pct": 0,
                    "y_pct": 70,
                    "width_pct": 100,
                    "height_pct": 30,
                    "color": "#808080",
                    "opacity": 1,
                },
            },
        }
        pins = session.call("models.resolve", {"processing": recipe})
        self.assertEqual(pins, {})
        result = session.call(
            "media.process", {"asset_id": aid, "encoding": "review", "processing": recipe}
        )
        self.assertEqual(result["duration_ms"], 1000)
        self.assertTrue(result["has_audio"])
        self.assertEqual(result["processing"]["model_fingerprints"], {})
        frame = self.frame(result["path"], 0.5)
        # Grey band over the bottom 30%, black elsewhere: the source is black.
        self.assertGreater(float(frame[70:].mean()), 120)
        self.assertLess(float(frame[:60].mean()), 3)
        cached = session.call(
            "media.process",
            {
                "asset_id": aid,
                "encoding": "review",
                "processing": recipe,
                "model_fingerprints": pins,
            },
        )
        self.assertTrue(cached["cache_hit"])
        self.assertEqual(cached["sha256"], result["sha256"])

    def test_processing_combines_original_timed_subtitles_with_processed_video(self):
        session, aid = self.session()
        subtitle = self.root / "track.srt"
        subtitle.write_text("1\n00:00:00,650 --> 00:00:00,950\nCAPTION\n", encoding="utf-8")
        sid = session.call("asset.register", {"path": str(subtitle), "kind": "subtitle"})[
            "asset_id"
        ]
        params = self.request(aid)
        pins = session.call("models.resolve", {"processing": self.recipe()})
        plain = session.call("media.process", {**params, "model_fingerprints": pins})
        rendered = session.call(
            "media.process", {**params, "model_fingerprints": pins, "subtitle_id": sid}
        )
        self.assertEqual(rendered["duration_ms"], 1000)
        self.assertTrue(rendered["has_audio"])
        self.assertNotEqual(plain["sha256"], rendered["sha256"])
        early = self.frame(rendered["path"], 0.55)
        late = self.frame(rendered["path"], 0.8)
        # The caption burns over the cover band, so its bottom is brighter when visible.
        self.assertLess(float(early[65:].mean()), 3)
        self.assertGreater(float(late[65:].mean()), float(early[65:].mean()) + 0.2)

    def test_changed_pinned_model_is_rejected_and_does_not_poison_next_job(self):
        session, aid = self.session()
        pins = session.call("models.resolve", {"processing": self.recipe()})
        pins["ocr_en"] = "a" * 64
        with self.assertRaisesRegex(RuntimeError, "PROCESSING_MODELS_CHANGED"):
            session.call("media.process", self.request(aid, model_fingerprints=pins))
        self.assertFalse(list((self.workspace / "renders").glob("*/output.mp4")))
        self.assertTrue(
            session.call("media.render", {"asset_id": aid, "encoding": "review"})["has_audio"]
        )

    def test_original_changed_with_same_size_and_mtime_is_rejected_before_cache_hit(self):
        session, aid = self.session()
        session.call("media.render", {"asset_id": aid, "encoding": "review"})
        stat = self.source.stat()
        contents = bytearray(self.source.read_bytes())
        contents[-1] ^= 1
        self.source.write_bytes(contents)
        os.utime(self.source, ns=(stat.st_atime_ns, stat.st_mtime_ns))
        with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
            session.call("media.render", {"asset_id": aid, "encoding": "review"})

    def test_cache_manifest_recipe_must_match_not_only_its_output_hash(self):
        session, aid = self.session()
        args = {"asset_id": aid, "encoding": "review"}
        first = session.call("media.render", args)
        manifest_path = Path(first["path"]).parent / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["recipe"]["start_ms"] = 123
        manifest_path.write_text(json.dumps(manifest))
        second = session.call("media.render", args)
        self.assertFalse(second["cache_hit"])

    def test_cache_manifest_rejects_a_changed_cover_band(self):
        session, aid = self.session()
        pins = session.call("models.resolve", {"processing": self.recipe()})
        args = self.request(aid, model_fingerprints=pins)
        session.call("media.process", args)
        changed = {
            **args,
            "processing": {
                "subtitle_style": {
                    **self.recipe()["subtitle_style"],
                    "cover": {
                        **self.recipe()["subtitle_style"]["cover"],
                        "height_pct": 40,
                    },
                }
            },
        }
        second = session.call("media.process", changed)
        self.assertFalse(second["cache_hit"])

    @unittest.skipIf(importlib.util.find_spec("pysubs2"), "missing-component case only")
    def test_ocr_missing_serializer_fails_explicitly_without_custom_parser_fallback(self):
        session, aid = self.session()
        args = self.request(
            aid,
            processing={
                "ocr": {"language": "en", "sample_ms": 500, "min_confidence": 0.5},
            },
        )
        with self.assertRaisesRegex(RuntimeError, "COMPONENT_MISSING"):
            session.call("media.process", args)
