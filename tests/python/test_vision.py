"""Public worker/model-adapter tests with explicit doubles."""

from __future__ import annotations

import importlib
import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

from test_worker import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))

HAS_CV2 = bool(importlib.util.find_spec("numpy") and importlib.util.find_spec("cv2"))


class VisionProtocolTests(unittest.TestCase):
    def test_missing_models_are_actionable_and_do_not_break_render_capabilities(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Session(Path(directory))
            try:
                status = session.call("models.status", {})
                self.assertFalse(status["ocr"]["available"])
                self.assertEqual(status["ocr"]["code"], "MODEL_MISSING")
                self.assertTrue(session.call("hello", {})["ffmpeg"])
            finally:
                session.close()


def observation(start, text, *, box=(1, 2, 30, 10), confidence=0.9):
    return {
        "start_ms": start,
        "end_ms": start + 500,
        "detections": [{"text": text, "confidence": confidence, "box": list(box)}] if text else [],
    }


class TimedEvidenceTests(unittest.TestCase):
    def test_adjacent_text_merges_but_a_blank_frame_breaks_a_cue(self):
        from vision.merge import timed_cues

        cues = timed_cues(
            [
                observation(1000, "Tiếng Việt"),
                observation(1500, "Tiếng Việt"),
                observation(2000, ""),
                observation(2500, "Tiếng Việt"),
            ]
        )
        self.assertEqual(
            [(c["start_ms"], c["end_ms"], c["text"]) for c in cues],
            [(1000, 2000, "Tiếng Việt"), (2500, 3000, "Tiếng Việt")],
        )

    def test_one_misread_character_does_not_break_one_original_line(self):
        from vision.merge import timed_cues

        cues = timed_cues(
            [
                observation(0, "Xin chào các bạn"),
                observation(500, "Xin chào các bẹn"),
                observation(1000, "Xin chào các bạn"),
            ]
        )
        self.assertEqual(len(cues), 1)
        self.assertEqual((cues[0]["start_ms"], cues[0]["end_ms"]), (0, 1500))
        self.assertEqual(cues[0]["text"], "Xin chào các bạn")

    def test_a_different_line_or_a_moved_box_splits(self):
        from vision.merge import timed_cues

        cues = timed_cues(
            [
                observation(0, "First line"),
                observation(500, "A completely different line"),
                observation(1000, "First line", box=(500, 400, 600, 430)),
            ]
        )
        self.assertEqual(
            [c["text"] for c in cues], ["First line", "A completely different line", "First line"]
        )

    def test_a_sampling_gap_always_splits_even_with_matching_text(self):
        from vision.merge import timed_cues

        cues = timed_cues([observation(0, "Same"), observation(2000, "Same")])
        self.assertEqual(len(cues), 2)

    def test_the_text_is_a_confidence_weighted_vote_across_samples(self):
        from vision.merge import timed_cues

        cues = timed_cues(
            [
                observation(0, "Đúng", confidence=0.9),
                observation(500, "Sai", confidence=0.4),
                observation(1000, "Đúng", confidence=0.8),
            ]
        )
        self.assertEqual(cues[0]["text"], "Đúng")

    def test_punctuation_and_whitespace_noise_still_merges(self):
        from vision.merge import timed_cues

        cues = timed_cues(
            [
                observation(0, "你好，世界"),
                observation(500, "你好世界"),
                observation(1000, "你好世界。"),
            ]
        )
        self.assertEqual(len(cues), 1)


class SubtitleRowTests(unittest.TestCase):
    def test_a_persistent_banner_is_not_joined_to_the_subtitle(self):
        from vision.merge import SubtitleRows

        rows = SubtitleRows(640, 360)
        lines = ["Alpha", "Bravo", "Charlie", "Delta"]
        for index, text in enumerate(lines):
            rows.add(
                {
                    "start_ms": index * 500,
                    "end_ms": index * 500 + 500,
                    "detections": [
                        {"text": "Follow", "confidence": 0.9, "box": [10, 10, 100, 30]},
                        {"text": text, "confidence": 0.9, "box": [100, 300, 500, 340]},
                    ],
                }
            )
        groups, regions = rows.finish()
        self.assertEqual([group.text() for group in groups], lines)
        self.assertTrue(all("\n" not in group.text() for group in groups))
        # The subtitle row is first; the banner is reported after it.
        self.assertGreater(regions[0]["y_pct"], 70)
        self.assertLess(regions[0]["height_pct"], 20)
        self.assertEqual(len(regions), 2)

    def test_a_larger_persistent_title_is_not_the_subtitle_row(self):
        from vision.merge import SubtitleRows

        rows = SubtitleRows(640, 360)
        title = {"text": "WATCH THE FULL VIDEO", "confidence": 0.9, "box": [20, 10, 620, 100]}
        lines = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]
        for index, text in enumerate(lines):
            rows.add(
                {
                    "start_ms": index * 500,
                    "end_ms": index * 500 + 500,
                    "detections": [
                        title,
                        {"text": text, "confidence": 0.9, "box": [150, 300, 500, 340]},
                    ],
                }
            )
        groups, regions = rows.finish()
        # The title is larger, but its text never changes; the subtitle row wins.
        self.assertEqual([group.text() for group in groups], lines)
        self.assertGreater(regions[0]["y_pct"], 70)
        self.assertLess(regions[0]["height_pct"], 20)

    def test_regions_are_capped_at_32_with_the_subtitle_row_first(self):
        from vision.merge import MAX_REGIONS, SubtitleRows

        rows = SubtitleRows(1000, 1000)
        for index in range(40):
            rows.add(
                {
                    "start_ms": index * 500,
                    "end_ms": index * 500 + 500,
                    "detections": [
                        {
                            "text": "x",
                            "confidence": 0.9,
                            "box": [10, index * 100, 50, index * 100 + 20],
                        }
                    ],
                }
            )
        _, regions = rows.finish()
        self.assertEqual(len(regions), MAX_REGIONS)


class BoundaryRefinementTests(unittest.TestCase):
    def frames(self, values):
        import numpy as np

        return [np.full((20, 40, 3), value, dtype=np.uint8) for value in values]

    def test_region_is_the_padded_clamped_box_union(self):
        from vision.refine import region_of

        self.assertEqual(region_of((10, 10, 50, 30), 6, 160, 90), (4, 4, 56, 36))
        self.assertIsNone(region_of(None, 6, 160, 90))
        self.assertEqual(region_of((2, 2, 158, 88), 6, 160, 90), (0, 0, 160, 90))

    def test_change_index_finds_the_single_region_step(self):
        from vision.refine import change_index

        frames = self.frames([0, 0, 255, 255])
        self.assertEqual(change_index(frames), 2)
        self.assertIsNone(change_index(self.frames([0, 0, 0])))

    def group(self):
        from types import SimpleNamespace

        return SimpleNamespace(
            start_ms=1000,
            end_ms=2000,
            prev=observation(500, ""),
            next=observation(2000, ""),
            first=observation(1000, "Text"),
            last=observation(1500, "Text"),
        )

    def test_boundaries_snap_to_the_decoded_frame_with_a_synthetic_sampler(self):
        from vision.refine import refine_boundaries

        black, white = self.frames([0])[0], self.frames([255])[0]

        def sampler(start_ms, end_ms, region):
            if start_ms == 500:
                return [(500, black), (600, black), (700, white), (800, white)]
            return [(1500, white), (1600, white), (1700, black)]

        self.assertEqual(refine_boundaries(self.group(), sampler, 160, 90), (700, 1700))

    def test_an_inconclusive_interval_keeps_the_ocr_sample_time(self):
        from vision.refine import refine_boundaries

        black = self.frames([0])[0]
        flat = lambda start, end, region: [(start, black), (end, black)]  # noqa: E731
        self.assertEqual(refine_boundaries(self.group(), flat, 160, 90), (1000, 2000))

    def test_refined_edges_never_overrun_the_sample_window(self):
        from vision.refine import refine_boundaries

        black, white = self.frames([0])[0], self.frames([255])[0]

        def sampler(start_ms, end_ms, region):
            if start_ms == 500:
                # The strongest change sits on the extra frame past the window's end.
                return [(500, black), (900, black), (1100, white)]
            return [(1500, white), (2100, black)]

        # Clamped to the OCR sample times: group.first.start_ms and group.next.start_ms.
        self.assertEqual(refine_boundaries(self.group(), sampler, 160, 90), (1000, 2000))

    def test_refine_groups_keeps_adjacent_cues_from_overlapping(self):
        from types import SimpleNamespace
        from unittest.mock import patch

        import numpy as np
        from vision.refine import refine_groups

        def observation(start, text, x):
            return {
                "start_ms": start,
                "end_ms": start + 500,
                "detections": [{"text": text, "confidence": 0.9, "box": [x, 40, x + 90, 70]}],
            }

        first = SimpleNamespace(
            start_ms=0,
            end_ms=1000,
            prev=None,
            next=None,
            first=observation(0, "A", 10),
            last=observation(500, "A", 10),
        )
        second = SimpleNamespace(
            start_ms=1000,
            end_ms=2000,
            prev=observation(500, "A", 10),
            next=None,
            first=observation(1000, "B", 50),
            last=observation(1500, "B", 50),
        )
        first.next = second.first
        second.prev = first.last

        black = np.zeros((30, 90, 3), dtype=np.uint8)
        white = np.full((30, 90, 3), 255, dtype=np.uint8)

        def sampler(start_ms, end_ms, region):
            # The first cue's end snaps late; the second cue's start snaps early.
            if region[0] < 20:
                return [(500, black), (1000, white)]
            return [(500, black), (600, white)]

        with (
            patch("vision.refine._source_fps", return_value=24),
            patch("vision.refine.frame_sampler", return_value=sampler),
        ):
            refine_groups(SimpleNamespace(), {"id": "x"}, "video.mp4", 160, 90, [first, second])
        self.assertLessEqual(first.end_ms, second.start_ms)


class EvidenceRetentionTests(unittest.TestCase):
    def test_evidence_is_pruned_to_a_total_budget_newest_first(self):
        from unittest.mock import patch

        from vision import extraction

        with tempfile.TemporaryDirectory() as directory:
            analyses = Path(directory)
            for index in range(4):
                folder = analyses / f"analysis-{index}"
                folder.mkdir()
                (folder / "chunk.json").write_bytes(b"x" * 100)
                os.utime(folder, (index, index))
            with patch.object(extraction, "EVIDENCE_TOTAL_BYTES", 250):
                extraction.prune_analyses(analyses, "analysis-3")
            self.assertEqual(
                sorted(path.name for path in analyses.iterdir()),
                ["analysis-2", "analysis-3"],
            )


class RuntimeAvailabilityTests(unittest.TestCase):
    def test_a_pack_installed_after_start_is_detected_on_the_next_probe(self):
        from vision.models import runtime_available

        with tempfile.TemporaryDirectory() as directory:
            pack = Path(directory) / "packs"
            # The host puts the pack directory on PYTHONPATH before it exists.
            sys.path.insert(0, str(pack))
            try:
                self.assertFalse(runtime_available(("latepack",)))
                package = pack / "latepack"
                package.mkdir(parents=True)
                (package / "__init__.py").write_text("")
                self.assertTrue(runtime_available(("latepack",)))
            finally:
                sys.path.remove(str(pack))
                importlib.invalidate_caches()


class ModelRegistryTests(unittest.TestCase):
    def setUp(self):
        import hashlib
        import json

        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        artifact = self.root / "local.onnx"
        artifact.write_bytes(b"test fixture, NOT a neural model")
        self.artifact = {
            "path": "local.onnx",
            "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        }
        self.entry = {
            "det": self.artifact,
            "rec": self.artifact,
            "keys": self.artifact,
            "det_version": "PP-OCRv4",
            "rec_version": "PP-OCRv4",
            "rec_height": 48,
        }
        self.manifest = self.root / "models.json"
        self.manifest.write_text(json.dumps({"ocr": {"en": self.entry}}))

    def tearDown(self):
        self.temp.cleanup()

    def test_checksum_tampering_is_rejected(self):
        from runtime.errors import WorkerError
        from vision.models import ModelRegistry

        registry = ModelRegistry(self.manifest)
        self.assertEqual(len(registry.require("ocr", "en", runtime=False)["fingerprint"]), 64)
        (self.root / "local.onnx").write_bytes(b"tampered")
        with self.assertRaisesRegex(WorkerError, "MODEL_HASH_MISMATCH"):
            registry.require("ocr", "en", runtime=False)

    def test_unconfigured_vietnamese_is_not_replaced_with_chinese(self):
        import json

        from runtime.errors import WorkerError
        from vision.models import ModelRegistry

        self.manifest.write_text(json.dumps({"ocr": {"zh": self.entry}}))
        with self.assertRaisesRegex(WorkerError, "MODEL_LANGUAGE_UNAVAILABLE"):
            ModelRegistry(self.manifest).require("ocr", "vi", runtime=False)

    def test_url_and_unknown_manifest_fields_are_rejected(self):
        import json

        from runtime.errors import WorkerError
        from vision.models import ModelRegistry

        self.manifest.write_text(
            json.dumps(
                {
                    "ocr": {
                        "en": {
                            **self.entry,
                            "det": {**self.artifact, "path": "https://example.invalid/model.onnx"},
                        }
                    }
                }
            )
        )
        with self.assertRaisesRegex(WorkerError, "MODEL_MANIFEST_INVALID"):
            ModelRegistry(self.manifest).require("ocr", "en", runtime=False)
        self.manifest.write_text('{"command":"download"}')
        self.assertEqual(
            ModelRegistry(self.manifest).status()["ocr"]["code"], "MODEL_MANIFEST_INVALID"
        )

    def test_status_does_not_claim_inference_verification(self):
        from vision.models import ModelRegistry

        self.assertFalse(ModelRegistry(self.manifest).status()["ocr"]["verified"])


class VisionValidationTests(unittest.TestCase):
    def test_invalid_numbers_regions_and_long_samples_are_rejected(self):
        from runtime.errors import WorkerError
        from vision.service import parse_options

        p = {
            "asset_id": "v",
            "start_ms": 0,
            "end_ms": 1000,
            "language": "en",
            "sample_ms": 500,
            "min_confidence": 0.5,
        }
        for patch in (
            {"sample_ms": True},
            {"min_confidence": float("nan")},
            {"end_ms": 130000},
            {"shell": "run"},
            {"region": {"x": 0, "y": 0, "width": 2, "height": 1}},
            {"target": "text"},
        ):
            with self.subTest(patch=patch), self.assertRaises(WorkerError):
                parse_options("vision.ocr", {**p, **patch})

    def test_bad_vision_request_does_not_kill_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Session(Path(directory))
            try:
                with self.assertRaisesRegex(RuntimeError, "INVALID_REQUEST"):
                    session.call(
                        "media.ocr.extract", {"path": "/arbitrary/file", "shell": "anything"}
                    )
                self.assertTrue(session.call("hello", {})["ffmpeg"])
            finally:
                session.close()


@unittest.skipUnless(HAS_CV2, "optional NumPy/OpenCV required")
class ModelAdapterDoubleTests(unittest.TestCase):
    """Geometry/pre/postprocessing with deterministic SDK doubles, not AI quality."""

    def test_ocr_crop_offsets_and_confidence_filtering(self):
        from types import SimpleNamespace

        import numpy as np
        from vision.algorithms import RapidAdapter

        def engine(image, **kwargs):
            return SimpleNamespace(
                boxes=[[[0, 0], [10, 0], [10, 5], [0, 5]], [[1, 1], [4, 1], [4, 4], [1, 4]]],
                txts=["Tiếng Việt", "noise"],
                scores=[0.9, 0.1],
            )

        out = RapidAdapter(engine).detect(
            np.zeros((100, 200, 3), dtype=np.uint8),
            rectangle={"x": 0.5, "y": 0.5, "width": 0.5, "height": 0.5},
        )
        self.assertEqual(
            out, [{"text": "Tiếng Việt", "confidence": 0.9, "box": [100, 50, 110, 55]}]
        )
