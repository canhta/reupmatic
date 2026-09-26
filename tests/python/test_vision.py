"""Public worker/model-adapter tests with explicit doubles."""

from __future__ import annotations

import importlib.util
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
                self.assertFalse(status["inpainting"]["available"])
                self.assertTrue(session.call("hello", {})["ffmpeg"])
            finally:
                session.close()


class TimedEvidenceTests(unittest.TestCase):
    def test_adjacent_text_merges_but_a_blank_frame_breaks_a_cue(self):
        from vision.algorithms import timed_cues

        def observation(start, text):
            return {
                "start_ms": start,
                "end_ms": start + 500,
                "detections": [{"text": text, "confidence": 0.9, "box": [1, 2, 30, 10]}]
                if text
                else [],
            }

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


@unittest.skipUnless(HAS_CV2, "optional NumPy/OpenCV required")
class MaskGeometryTests(unittest.TestCase):
    def test_normalized_rectangle_uses_half_open_pixel_edges(self):
        from vision.algorithms import make_mask

        mask = make_mask(100, 50, {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4}, [], 0)
        self.assertEqual(int((mask > 0).sum()), 600)
        self.assertEqual(int(mask[10, 10]), 255)
        self.assertEqual(int(mask[30, 40]), 0)


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
        self.manifest = self.root / "models.json"
        self.manifest.write_text(json.dumps({"inpainting": {"model": self.artifact}}))

    def tearDown(self):
        self.temp.cleanup()

    def test_checksum_tampering_is_rejected(self):
        from runtime.errors import WorkerError
        from vision.models import ModelRegistry

        registry = ModelRegistry(self.manifest)
        self.assertEqual(len(registry.require("inpainting", runtime=False)["fingerprint"]), 64)
        (self.root / "local.onnx").write_bytes(b"tampered")
        with self.assertRaisesRegex(WorkerError, "MODEL_HASH_MISMATCH"):
            registry.require("inpainting", runtime=False)

    def test_unconfigured_vietnamese_is_not_replaced_with_chinese(self):
        import json

        from runtime.errors import WorkerError
        from vision.models import ModelRegistry

        entry = {
            "det": self.artifact,
            "rec": self.artifact,
            "keys": self.artifact,
            "det_version": "PP-OCRv4",
            "rec_version": "PP-OCRv4",
            "rec_height": 48,
        }
        self.manifest.write_text(json.dumps({"ocr": {"zh": entry}}))
        with self.assertRaisesRegex(WorkerError, "MODEL_LANGUAGE_UNAVAILABLE"):
            ModelRegistry(self.manifest).require("ocr", "vi", runtime=False)

    def test_url_and_unknown_manifest_fields_are_rejected(self):
        import json

        from runtime.errors import WorkerError
        from vision.models import ModelRegistry

        self.manifest.write_text(
            json.dumps(
                {
                    "inpainting": {
                        "model": {**self.artifact, "path": "https://example.invalid/model.onnx"}
                    },
                }
            )
        )
        with self.assertRaisesRegex(WorkerError, "MODEL_MANIFEST_INVALID"):
            ModelRegistry(self.manifest).require("inpainting", runtime=False)
        self.manifest.write_text('{"command":"download"}')
        self.assertEqual(
            ModelRegistry(self.manifest).status()["ocr"]["code"], "MODEL_MANIFEST_INVALID"
        )

    def test_status_does_not_claim_inference_verification(self):
        from vision.models import ModelRegistry

        self.assertFalse(ModelRegistry(self.manifest).status()["inpainting"]["verified"])

    def signature_session(self, image_shape, mask_shape=("batch", 1, 512, 512)):
        from types import SimpleNamespace

        class SessionDouble:
            def get_inputs(self):
                return [
                    SimpleNamespace(name="image", shape=list(image_shape), type="tensor(float)"),
                    SimpleNamespace(name="mask", shape=list(mask_shape), type="tensor(float)"),
                ]

        return SessionDouble()

    def test_status_opens_the_model_and_names_an_unsupported_signature(self):
        from unittest.mock import patch

        from vision.models import ModelRegistry

        with (
            patch("vision.models.runtime_available", return_value=True),
            patch(
                "vision.models.open_inpainting_session",
                return_value=self.signature_session([1, 3, 256, 256]),
            ),
        ):
            status = ModelRegistry(self.manifest).status()
        self.assertFalse(status["inpainting"]["available"])
        self.assertEqual(status["inpainting"]["code"], "MODEL_SHAPE_UNSUPPORTED")

    def test_status_offers_the_installed_symbolic_signature(self):
        from unittest.mock import patch

        from vision.models import ModelRegistry

        with (
            patch("vision.models.runtime_available", return_value=True),
            patch(
                "vision.models.open_inpainting_session",
                return_value=self.signature_session(["batch", 3, 512, 512]),
            ),
        ):
            status = ModelRegistry(self.manifest).status()
        self.assertTrue(status["inpainting"]["available"])
        self.assertIsNone(status["inpainting"]["code"])
        self.assertFalse(status["inpainting"]["verified"])

    def test_status_opens_the_session_once_per_model_file(self):
        from unittest.mock import patch

        from vision.models import ModelRegistry

        opened = []

        def opener(path):
            opened.append(str(path))
            return self.signature_session(["batch", 3, 512, 512])

        with (
            patch("vision.models.runtime_available", return_value=True),
            patch("vision.models.open_inpainting_session", side_effect=opener),
        ):
            first = ModelRegistry(self.manifest).status()
            second = ModelRegistry(self.manifest).status()
        self.assertTrue(first["inpainting"]["available"])
        self.assertTrue(second["inpainting"]["available"])
        self.assertEqual(len(opened), 1)

    def test_a_changed_weight_reopens_the_session(self):
        import hashlib
        import json
        from unittest.mock import patch

        from vision.models import ModelRegistry

        opened = []

        def opener(path):
            opened.append(str(path))
            return self.signature_session(["batch", 3, 512, 512])

        with (
            patch("vision.models.runtime_available", return_value=True),
            patch("vision.models.open_inpainting_session", side_effect=opener),
        ):
            ModelRegistry(self.manifest).status()
            (self.root / "local.onnx").write_bytes(b"a different weight file")
            self.artifact["sha256"] = hashlib.sha256(b"a different weight file").hexdigest()
            self.manifest.write_text(json.dumps({"inpainting": {"model": self.artifact}}))
            ModelRegistry(self.manifest).status()
        self.assertEqual(len(opened), 2)

    def test_status_survives_a_model_that_cannot_be_opened(self):
        from unittest.mock import patch

        from vision.models import ModelRegistry

        with (
            patch("vision.models.runtime_available", return_value=True),
            patch("vision.models.open_inpainting_session", side_effect=ValueError("not a model")),
        ):
            status = ModelRegistry(self.manifest).status()
        self.assertFalse(status["inpainting"]["available"])
        self.assertEqual(status["inpainting"]["code"], "MODEL_INFERENCE_FAILED")


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
        ):
            with self.subTest(patch=patch), self.assertRaises(WorkerError):
                parse_options("vision.ocr", {**p, **patch})

    def test_bad_vision_request_does_not_kill_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Session(Path(directory))
            try:
                with self.assertRaisesRegex(RuntimeError, "INVALID_REQUEST"):
                    session.call("media.inpaint", {"path": "/arbitrary/file", "shell": "anything"})
                self.assertTrue(session.call("hello", {})["ffmpeg"])
            finally:
                session.close()


class LamaSignatureTests(unittest.TestCase):
    """The catalogue Carve model declares a symbolic batch dimension on both inputs."""

    def session(self, image_shape, mask_shape=("batch", 1, 512, 512)):
        from types import SimpleNamespace

        class SessionDouble:
            def get_inputs(self):
                return [
                    SimpleNamespace(name="image", shape=list(image_shape), type="tensor(float)"),
                    SimpleNamespace(name="mask", shape=list(mask_shape), type="tensor(float)"),
                ]

        return SessionDouble()

    def test_symbolic_or_literal_batch_dimensions_are_accepted(self):
        from vision.algorithms import LamaAdapter

        for image, mask in (
            (["batch", 3, 512, 512], ["batch", 1, 512, 512]),
            ([None, 3, 512, 512], [None, 1, 512, 512]),
            ([1, 3, 512, 512], [1, 1, 512, 512]),
        ):
            with self.subTest(image=image):
                LamaAdapter(self.session(image, mask))

    def test_wrong_plane_channels_or_type_are_still_rejected(self):
        from types import SimpleNamespace

        from runtime.errors import WorkerError
        from vision.algorithms import LamaAdapter

        class IntImageDouble:
            def get_inputs(self):
                return [
                    SimpleNamespace(
                        name="image", shape=["batch", 3, 512, 512], type="tensor(int32)"
                    ),
                    SimpleNamespace(
                        name="mask", shape=["batch", 1, 512, 512], type="tensor(float)"
                    ),
                ]

        bad_inputs = (
            (["batch", 3, 256, 256], ["batch", 1, 512, 512]),
            (["batch", 3, 512, 512], ["batch", 3, 512, 512]),
            (["batch", "batch", 512, 512], ["batch", 1, 512, 512]),
            (["batch", 3, 512, 512, 1], ["batch", 1, 512, 512]),
        )
        for image, mask in bad_inputs:
            with self.assertRaisesRegex(WorkerError, "MODEL_SHAPE_UNSUPPORTED"):
                LamaAdapter(self.session(image, mask))
        with self.assertRaisesRegex(WorkerError, "MODEL_SHAPE_UNSUPPORTED"):
            LamaAdapter(IntImageDouble())


@unittest.skipUnless(HAS_CV2, "optional NumPy/OpenCV required")
class ModelAdapterDoubleTests(unittest.TestCase):
    """Geometry/pre/postprocessing with deterministic SDK doubles, not AI quality."""

    def session(self, shape=(1, 3, 512, 512)):
        from types import SimpleNamespace

        import numpy as np

        class SessionDouble:
            def get_inputs(self):
                return [
                    SimpleNamespace(name="image", shape=list(shape), type="tensor(float)"),
                    SimpleNamespace(name="mask", shape=[1, 1, 512, 512], type="tensor(float)"),
                ]

            def run(self, outputs, feed):
                assert feed["image"].dtype == np.float32
                assert set(np.unique(feed["mask"])).issubset({0, 1})
                return [np.full((1, 3, 512, 512), 180, dtype=np.float32)]

        return SessionDouble()

    def test_lama_composites_only_masked_pixels_in_non_square_frame(self):
        import numpy as np
        from vision.algorithms import LamaAdapter, make_mask

        image = np.full((90, 160, 3), 17, dtype=np.uint8)
        mask = make_mask(160, 90, {"x": 0.25, "y": 0.2, "width": 0.5, "height": 0.4}, [], 0)
        out = LamaAdapter(self.session()).erase(image, mask)
        self.assertTrue(np.array_equal(out[mask == 0], image[mask == 0]))
        self.assertTrue(np.all(out[mask > 0] == 180))

    def test_empty_mask_keeps_all_pixels_unchanged(self):
        import numpy as np
        from vision.algorithms import LamaAdapter

        image = np.full((10, 20, 3), 25, dtype=np.uint8)
        self.assertTrue(
            np.array_equal(
                LamaAdapter(self.session()).erase(image, np.zeros((10, 20), dtype=np.uint8)), image
            )
        )

    def test_wrong_model_shape_is_actionable(self):
        from runtime.errors import WorkerError
        from vision.algorithms import LamaAdapter

        with self.assertRaisesRegex(WorkerError, "MODEL_SHAPE_UNSUPPORTED"):
            LamaAdapter(self.session((1, 3, 256, 256)))

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
