"""Processing contracts and chunk composition with explicit doubles."""

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from processing.chunks import intervals, ocr_window, progress_for
from processing.ocr_scan import scan_cues, scan_subtitles
from processing.recipe import parse_fingerprints, parse_recipe, required_models
from runtime.errors import WorkerError
from vision.service import DISK_RESERVE, MAX_OCR_EDGE, MAX_SEGMENT_BYTES

ROOT = Path(__file__).resolve().parents[2]


class RecipeTests(unittest.TestCase):
    def setUp(self):
        self.recipe = {"ocr": {"language": "vi", "sample_ms": 500, "min_confidence": 0.5}}

    def test_strict_recipe_and_independent_snapshot(self):
        canonical = parse_recipe(self.recipe)
        canonical["ocr"]["language"] = "en"
        self.assertEqual(self.recipe["ocr"]["language"], "vi")
        for bad in [
            None,
            [],
            {},
            {**self.recipe, "shell": "command"},
            {**self.recipe, "ocr": {**self.recipe["ocr"], "sample_ms": True}},
            {**self.recipe, "ocr": {**self.recipe["ocr"], "min_confidence": float("nan")}},
            {"inpaint": {"target": "text", "language": "en", "padding_px": 4}},
            {"inpaint": {"target": "manual", "padding_px": 4}},
        ]:
            with self.subTest(bad=bad), self.assertRaisesRegex(WorkerError, "INVALID_PROCESSING"):
                parse_recipe(bad)

    def test_subtitle_conflict_and_model_snapshots_are_exact(self):
        with self.assertRaisesRegex(WorkerError, "PROCESSING_SUBTITLE_CONFLICT"):
            parse_recipe(self.recipe, has_subtitles=True)
        self.assertEqual(required_models(self.recipe), ["ocr_vi"])
        pins = {key: "a" * 64 for key in required_models(self.recipe)}
        self.assertEqual(parse_fingerprints(pins, self.recipe), pins)
        for value in [{}, {**pins, "unexpected": "a" * 64}, {**pins, "ocr_vi": "bad"}]:
            with self.assertRaisesRegex(WorkerError, "INVALID_PROCESSING_MODELS"):
                parse_fingerprints(value, self.recipe)


class ChunkCompositionTests(unittest.TestCase):
    def test_windows_preserve_sampling_grid_and_fit_worst_case_decoded_frames(self):
        for sample in [100, 333, 500, 700, 2000]:
            window = ocr_window(sample)
            self.assertEqual(window % sample, 0)
            self.assertLessEqual(window, 120000)
            self.assertLessEqual(
                window // sample * MAX_OCR_EDGE**2 * 3 + DISK_RESERVE, MAX_SEGMENT_BYTES
            )
            segments = list(intervals(175, 300123, window))
            self.assertEqual(segments[0][0], 175)
            self.assertEqual(segments[-1][1], 300123)
            self.assertTrue(all(a[1] == b[0] for a, b in zip(segments, segments[1:])))

    def test_progress_does_not_regress_when_decode_inference_and_encode_phases_restart(self):
        events = []
        host = SimpleNamespace(emit=lambda req, event, data: events.append(data))
        emit = progress_for(host, {}, "processingOcr", 10000, 20000, 0, 30000)
        for fraction in [None, 0.5, 0.1, float("nan"), None, 1]:
            emit({"fraction": fraction})
        fractions = [event["fraction"] for event in events]
        self.assertEqual(fractions, sorted(fractions))
        self.assertAlmostEqual(fractions[0], 1 / 3)
        self.assertLess(fractions[-1], 2 / 3)

    def test_ocr_merges_adjacent_near_text_across_chunks_and_a_blank_splits(self):
        options = {"language": "en", "sample_ms": 500, "min_confidence": 0.5}
        window = ocr_window(500)
        pins = {"ocr_en": "a" * 64}
        calls = []
        serialized = []
        host = SimpleNamespace(
            cancelled=lambda req: None,
            emit=lambda *args: None,
            assets=SimpleNamespace(get=lambda *args: {"path": "/controlled/source.mp4"}),
        )
        req = {"id": "test", "method": "media.process", "params": {"asset_id": "registered-source"}}

        def detection(text, confidence=0.9):
            return {"text": text, "confidence": confidence, "box": [10, 10, 120, 40]}

        class VisionDouble:
            def __init__(self, host):
                pass

            def run(self, request, *, staging, emit_progress):
                p = request["params"]
                first, last = p["start_ms"], p["end_ms"]
                calls.append((first, last))
                analysis_id = str(len(calls))
                (staging / f"{analysis_id}.json").write_text("{}")
                # One misread character ("taxt") must not break the line; the third chunk starts
                # blank, which does break it.
                if len(calls) == 3:
                    observations = [
                        {"start_ms": first, "end_ms": first + 500, "detections": []},
                        {
                            "start_ms": first + 500,
                            "end_ms": last,
                            "detections": [detection("Same text")],
                        },
                    ]
                else:
                    observations = [
                        {
                            "start_ms": first,
                            "end_ms": first + 500,
                            "detections": [detection("Same text")],
                        },
                        {
                            "start_ms": first + 500,
                            "end_ms": last,
                            "detections": [detection("Same taxt", 0.6)],
                        },
                    ]
                return {
                    "width": 160,
                    "height": 90,
                    "observations": observations,
                    "analysis_id": analysis_id,
                    "cues": [],
                    "model_fingerprints": {"ocr": pins["ocr_en"]},
                }

        class DocumentDouble:
            def save(self, filename, **kwargs):
                Path(filename).write_text("SERIALIZER DOUBLE: NOT SUBRIP EVIDENCE")

        def document(host, request):
            serialized.extend(copy.deepcopy(request["params"]["cues"]))
            return DocumentDouble()

        with tempfile.TemporaryDirectory() as directory:
            staging = Path(directory)
            with (
                patch("processing.ocr_scan.VisionService", VisionDouble),
                patch("processing.ocr_scan.refine_groups", lambda *args, **kwargs: None),
                patch("subtitles.service.cue_document", document),
            ):
                track, count = scan_subtitles(
                    host, req, options, 250, 250 + 3 * window, staging, pins
                )
            self.assertEqual(count, 2)
            self.assertEqual(serialized[0]["text"], "Same text")
            self.assertEqual(serialized[0]["start_ms"], 250)
            self.assertEqual(serialized[0]["end_ms"], 250 + 2 * window)
            self.assertEqual(serialized[1]["start_ms"], 750 + 2 * window)
            self.assertEqual(track.name, "track.srt")
            self.assertEqual(list(staging.glob("*.json")), [])


class RegionScanTests(unittest.TestCase):
    def test_regions_cover_subtitles_after_the_preview_window(self):
        options = {"language": "en", "sample_ms": 500, "min_confidence": 0.5}
        pins = {"ocr_en": "a" * 64}
        calls = []
        host = SimpleNamespace(
            cancelled=lambda req: None,
            emit=lambda *args: None,
            assets=SimpleNamespace(get=lambda *args: {"path": "/controlled/source.mp4"}),
        )
        req = {
            "id": "test",
            "method": "media.ocr.extract",
            "params": {"asset_id": "registered-source"},
        }

        class VisionDouble:
            def __init__(self, host):
                pass

            def run(self, request, *, staging, emit_progress):
                p = request["params"]
                first, last = p["start_ms"], p["end_ms"]
                calls.append((first, last))
                analysis_id = str(len(calls))
                (staging / f"{analysis_id}.json").write_text("{}")
                observations = []
                for start in range(first, last, 500):
                    later = start >= 15000
                    observations.append(
                        {
                            "start_ms": start,
                            "end_ms": min(start + 500, last),
                            "detections": [
                                {
                                    "text": "Later" if later else "Early",
                                    "confidence": 0.9,
                                    "box": [200, 300, 500, 350] if later else [200, 100, 500, 150],
                                }
                            ],
                        }
                    )
                return {
                    "width": 640,
                    "height": 360,
                    "observations": observations,
                    "analysis_id": analysis_id,
                    "cues": [],
                    "model_fingerprints": {"ocr": pins["ocr_en"]},
                }

        with tempfile.TemporaryDirectory() as directory:
            staging = Path(directory)
            with (
                patch("processing.ocr_scan.VisionService", VisionDouble),
                patch("processing.ocr_scan.refine_groups", lambda *args, **kwargs: None),
            ):
                result = scan_cues(host, req, options, 0, 20000, staging, pins)
        # The preview keeps the first 20 samples (10 s); the regions still see the whole scan.
        self.assertEqual(len(result["observations"]), 20)
        self.assertNotIn(
            "Later",
            [
                d["text"]
                for observation in result["observations"]
                for d in observation["detections"]
            ],
        )
        later = [region for region in result["regions"] if region["y_pct"] > 80]
        self.assertEqual(len(later), 1)
        self.assertEqual(later[0]["count"], 10)


class RefinementProgressTests(unittest.TestCase):
    def test_refinement_is_reported_as_its_own_progress_phase(self):
        options = {"language": "en", "sample_ms": 500, "min_confidence": 0.5}
        pins = {"ocr_en": "a" * 64}
        events = []
        host = SimpleNamespace(
            cancelled=lambda req: None,
            emit=lambda req, event, data: events.append(data),
            assets=SimpleNamespace(get=lambda *args: {"path": "/controlled/source.mp4"}),
        )
        req = {
            "id": "test",
            "method": "media.ocr.extract",
            "params": {"asset_id": "registered-source"},
        }
        counter = [0]

        class VisionDouble:
            def __init__(self, host):
                pass

            def run(self, request, *, staging, emit_progress):
                counter[0] += 1
                p = request["params"]
                (staging / f"{counter[0]}.json").write_text("{}")
                return {
                    "width": 160,
                    "height": 90,
                    "observations": [
                        {
                            "start_ms": p["start_ms"],
                            "end_ms": p["end_ms"],
                            "detections": [
                                {"text": "Text", "confidence": 0.9, "box": [10, 40, 100, 70]}
                            ],
                        }
                    ],
                    "analysis_id": str(counter[0]),
                    "cues": [],
                    "model_fingerprints": {"ocr": pins["ocr_en"]},
                }

        def refiner(host, req, path, width, height, groups, on_progress=None):
            if on_progress is not None:
                on_progress(1.0)

        with tempfile.TemporaryDirectory() as directory:
            with (
                patch("processing.ocr_scan.VisionService", VisionDouble),
                patch("processing.ocr_scan.refine_groups", refiner),
            ):
                scan_cues(host, req, options, 0, 1000, Path(directory), pins)
        fractions = [
            event["fraction"] for event in events if event.get("phase") == "processingOcrRefine"
        ]
        self.assertEqual(fractions, [0, 1.0])


class ProcessingSchemaTests(unittest.TestCase):
    def setUp(self):
        try:
            from jsonschema import Draft202012Validator
        except ImportError:
            self.skipTest("test-only jsonschema is unavailable")
        self.validator = Draft202012Validator
        self.schemas = {
            file.name: json.loads(file.read_text())
            for file in (ROOT / "contracts").glob("*.schema.json")
        }

    def test_embedded_recipes_stay_identical_to_the_standalone_contract(self):
        base = self.schemas["processing.schema.json"]
        shape = {
            key: value
            for key, value in base.items()
            if key not in ("$schema", "$id", "$comment", "title", "description")
        }

        def find_recipe(value):
            if isinstance(value, dict):
                if {"ocr", "subtitle_style"} <= value.get("properties", {}).keys():
                    yield value
                for child in value.values():
                    yield from find_recipe(child)
            elif isinstance(value, list):
                for child in value:
                    yield from find_recipe(child)

        for name in [
            "project.schema.json",
            "batch-submit.schema.json",
            "folder-create.schema.json",
            "worker-request.schema.json",
        ]:
            found = list(find_recipe(self.schemas[name]))
            self.assertTrue(found, name)
            for recipe in found:
                self.assertEqual(recipe, shape, name)

    def test_processing_request_is_data_only_and_plain_render_stays_strict(self):
        recipe = {"ocr": {"language": "en", "sample_ms": 500, "min_confidence": 0.5}}
        request = {
            "v": 1,
            "id": "test",
            "revision": 0,
            "method": "media.process",
            "params": {
                "asset_id": "source",
                "encoding": "review",
                "processing": recipe,
            },
        }
        validator = self.validator(self.schemas["worker-request.schema.json"])
        self.assertTrue(validator.is_valid(request))
        request["params"]["shell"] = "run"
        self.assertFalse(validator.is_valid(request))
        del request["params"]["shell"]
        request["method"] = "media.render"
        self.assertFalse(validator.is_valid(request))
        request["method"] = "models.resolve"
        request["params"] = {"processing": recipe}
        self.assertTrue(validator.is_valid(request))
