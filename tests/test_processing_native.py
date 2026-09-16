"""Native media integration with controlled SDK doubles, not real-model quality."""

import hashlib
import importlib.util
import json
import os
import subprocess
import time
import unittest
from pathlib import Path

from vision_fixture import HAS_NATIVE, VisionFixture


@unittest.skipUnless(HAS_NATIVE, "FFmpeg and NumPy/OpenCV required")
class ProcessingNativeTests(VisionFixture, unittest.TestCase):
    def recipe(self):
        return {
            "version": 1,
            "inpaint": {
                "target": "manual",
                "padding_px": 0,
                "region": {"x": 0.25, "y": 0.2, "width": 0.5, "height": 0.4},
            },
        }

    def request(self, aid, **extra):
        return {
            "asset_id": aid,
            "mode": "full",
            "encoding": "review",
            "processing": self.recipe(),
            **extra,
        }

    def test_full_video_crosses_chunk_boundary_preserving_audio_and_cache_identity(self):
        self.source.unlink()
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=black:s=160x90:r=24:d=10.5",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=600:duration=10.5",
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
        original = hashlib.sha256(self.source.read_bytes()).hexdigest()
        session, aid = self.session()
        pins = session.call("models.resolve", {"processing": self.recipe()})
        result = session.call("media.process", self.request(aid, model_fingerprints=pins))
        self.assertEqual(result["duration_ms"], 10500)
        self.assertTrue(result["has_audio"])
        self.assertEqual(result["processing"]["inpaint_frame_count"], 252)
        self.assertEqual(result["processing"]["model_fingerprints"], pins)
        cached = session.call("media.process", self.request(aid, model_fingerprints=pins))
        self.assertTrue(cached["cache_hit"])
        self.assertEqual(cached["sha256"], result["sha256"])
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), original)
        self.assertFalse(list(self.workspace.glob("processing-*")))
        self.assertFalse(list(self.workspace.glob("vision-*")))
        count = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-count_frames",
                "-show_entries",
                "stream=nb_read_frames",
                "-of",
                "json",
                result["path"],
            ]
        )
        self.assertEqual(json.loads(count)["streams"][0]["nb_read_frames"], "252")

    def test_sample_combines_original_timed_subtitles_with_processed_video(self):
        session, aid = self.session()
        subtitle = self.root / "track.srt"
        subtitle.write_text("1\n00:00:00,650 --> 00:00:00,950\nCAPTION\n", encoding="utf-8")
        sid = session.call("asset.register", {"path": str(subtitle), "kind": "subtitle"})[
            "asset_id"
        ]
        params = self.request(aid, mode="sample", start_ms=500, end_ms=1000)
        plain = session.call("media.process", params)
        rendered = session.call("media.process", {**params, "subtitle_id": sid})
        self.assertEqual(rendered["duration_ms"], 500)
        self.assertTrue(rendered["has_audio"])
        self.assertNotEqual(plain["sha256"], rendered["sha256"])

        def frame(filename, offset):
            return subprocess.check_output(
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

        import numpy as np

        early = np.frombuffer(frame(rendered["path"], 0), dtype=np.uint8).reshape(90, 160, 3)
        late = np.frombuffer(frame(rendered["path"], 0.25), dtype=np.uint8).reshape(90, 160, 3)
        self.assertLess(float(early[65:].mean()), 3)
        self.assertGreater(float(late[65:].mean()), float(early[65:].mean()) + 0.2)

    def test_changed_pinned_model_is_rejected_and_does_not_poison_next_job(self):
        session, aid = self.session()
        pins = session.call("models.resolve", {"processing": self.recipe()})
        pins["inpainting"] = "a" * 64
        with self.assertRaisesRegex(RuntimeError, "PROCESSING_MODELS_CHANGED"):
            session.call("media.process", self.request(aid, model_fingerprints=pins))
        self.assertFalse(list((self.workspace / "renders").glob("*/output.mp4")))
        self.assertTrue(
            session.call("media.render", {"asset_id": aid, "mode": "full", "encoding": "review"})[
                "has_audio"
            ]
        )

    def test_cancel_covers_child_inference_and_removes_owned_temporary_chunks(self):
        session, aid = self.session(slow=True)
        rid = session.send("media.process", self.request(aid))
        while True:
            message = session.messages.get(timeout=20)
            session.events.append(message)
            if message["id"] != rid:
                continue
            if message["event"] == "error":
                self.fail(str(message))
            if message["event"] == "progress" and (message["data"].get("fraction") or 0) > 0:
                break
        started = time.monotonic()
        self.assertTrue(session.call("cancel", {"request_id": rid})["requested"])
        self.assertEqual(session.wait(rid)["data"]["code"], "CANCELLED")
        self.assertLess(time.monotonic() - started, 5)
        self.assertFalse(list((self.workspace / "renders").glob("*/output.mp4")))
        self.assertFalse(list(self.workspace.glob("processing-*")))
        self.assertFalse(list(self.workspace.glob("vision-*")))
        self.assertTrue(session.call("hello", {})["ffmpeg"])

    def test_original_changed_with_same_size_and_mtime_is_rejected_before_cache_hit(self):
        session, aid = self.session()
        session.call("media.render", {"asset_id": aid, "mode": "full", "encoding": "review"})
        stat = self.source.stat()
        contents = bytearray(self.source.read_bytes())
        contents[-1] ^= 1
        self.source.write_bytes(contents)
        os.utime(self.source, ns=(stat.st_atime_ns, stat.st_mtime_ns))
        with self.assertRaisesRegex(RuntimeError, "SOURCE_CHANGED"):
            session.call("media.render", {"asset_id": aid, "mode": "full", "encoding": "review"})

    def test_cache_manifest_recipe_must_match_not_only_its_output_hash(self):
        session, aid = self.session()
        args = {"asset_id": aid, "mode": "full", "encoding": "review"}
        first = session.call("media.render", args)
        manifest_path = Path(first["path"]).parent / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["recipe"]["start_ms"] = 123
        manifest_path.write_text(json.dumps(manifest))
        second = session.call("media.render", args)
        self.assertFalse(second["cache_hit"])

    @unittest.skipIf(importlib.util.find_spec("pysubs2"), "missing-component case only")
    def test_ocr_missing_serializer_fails_explicitly_without_custom_parser_fallback(self):
        session, aid = self.session()
        args = self.request(
            aid,
            processing={
                "version": 1,
                "ocr": {"language": "en", "sample_ms": 500, "min_confidence": 0.5},
            },
        )
        with self.assertRaisesRegex(RuntimeError, "COMPONENT_MISSING"):
            session.call("media.process", args)
