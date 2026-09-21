import importlib.util
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from runtime.errors import WorkerError
from vision.service import parse_options

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(importlib.util.find_spec("jsonschema"), "test-only jsonschema unavailable")
class VisionContracts(unittest.TestCase):
    def setUp(self):
        from jsonschema import Draft202012Validator

        schema = json.loads((ROOT / "contracts/worker-request.schema.json").read_text())
        Draft202012Validator.check_schema(schema)
        self.validator = Draft202012Validator(schema)

    def valid(self, method, params):
        return self.validator.is_valid(
            {"v": 1, "id": "contract-test", "revision": 2, "method": method, "params": params}
        )

    def test_model_configuration_and_status_are_explicit_verbs(self):
        self.assertTrue(self.valid("models.status", {}))
        self.assertTrue(self.valid("models.configure", {"path": "/native/selected.json"}))
        self.assertFalse(
            self.valid("models.configure", {"path": "/native/selected.json", "download": True})
        )
        self.assertFalse(self.valid("models.status", {"path": "/unrequested/path"}))

    def test_ocr_bounds_and_unknown_fields_match_runtime(self):
        params = {
            "asset_id": "known-asset",
            "start_ms": 0,
            "end_ms": 2000,
            "language": "vi",
            "sample_ms": 500,
            "min_confidence": 0.5,
        }
        self.assertTrue(self.valid("media.ocr", params))
        self.assertEqual(parse_options("media.ocr", params), params)
        for changed in ({"sample_ms": 10}, {"min_confidence": 2}, {"shell": "command"}):
            with self.subTest(changed=changed):
                self.assertFalse(self.valid("media.ocr", params | changed))
                with self.assertRaises(WorkerError):
                    parse_options("media.ocr", params | changed)

    def test_manual_and_text_inpainting_have_distinct_requirements(self):
        common = {"asset_id": "known-asset", "start_ms": 0, "end_ms": 1000, "padding_px": 4}
        manual = common | {
            "target": "manual",
            "region": {"x": 0, "y": 0.7, "width": 1, "height": 0.2},
        }
        text = common | {"target": "text", "language": "en"}
        for params in (manual, text):
            self.assertTrue(self.valid("media.inpaint", params))
            self.assertEqual(parse_options("media.inpaint", params), params)
        self.assertFalse(self.valid("media.inpaint", manual | {"language": "en"}))
        self.assertFalse(self.valid("media.inpaint", text | {"region": manual["region"]}))

    def test_relational_time_bounds_remain_runtime_validation(self):
        params = {
            "asset_id": "known-asset",
            "start_ms": 5000,
            "end_ms": 1000,
            "language": "en",
            "sample_ms": 500,
            "min_confidence": 0.5,
        }
        with self.assertRaises(WorkerError):
            parse_options("media.ocr", params)
