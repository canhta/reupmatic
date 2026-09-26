import importlib.util
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from runtime.errors import WorkerError
from subtitles.validation import validate_cues

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(importlib.util.find_spec("jsonschema"), "test-only jsonschema not installed")
class Contracts(unittest.TestCase):
    def setUp(self):
        from jsonschema import Draft202012Validator

        self.schemas = {
            p.name: json.loads(p.read_text())
            for p in (ROOT / "contracts").glob("*.schema.json")
            if not p.name.endswith(".source.schema.json")
        }
        for schema in self.schemas.values():
            Draft202012Validator.check_schema(schema)
        self.validator = Draft202012Validator

    def test_all_schemas_are_valid(self):
        self.assertEqual(len(self.schemas), 7)

    def test_batch_admission(self):
        v = self.validator(self.schemas["batch-submit.schema.json"])
        example = json.loads((ROOT / "contracts/examples/batch-submit.json").read_text())
        self.assertTrue(v.is_valid(example))
        example["items"][0]["path"] = "/not/a/native/picker/path"
        self.assertFalse(v.is_valid(example))
        del example["items"][0]["path"]
        example["items"] = []
        self.assertFalse(v.is_valid(example))

    def test_folder_creation(self):
        v = self.validator(self.schemas["folder-create.schema.json"])
        example = {
            "source_id": "picker-source",
            "output_id": "picker-output",
            "include_existing": False,
            "recursive": True,
        }
        self.assertTrue(v.is_valid(example))
        example["source_dir"] = "/untrusted/path"
        self.assertFalse(v.is_valid(example))
        del example["source_dir"]
        example["include_existing"] = "yes"
        self.assertFalse(v.is_valid(example))

    def test_project_schema(self):
        v = self.validator(self.schemas["project.schema.json"])
        example = {
            "format": "reupmatic.project",
            "source": {"path": "/videos/test.mp4", "sha256": "a" * 64},
            "cues": [],
        }
        self.assertTrue(v.is_valid(example))
        example["token"] = "secret"
        self.assertFalse(v.is_valid(example))

    def test_full_render_request(self):
        v = self.validator(self.schemas["worker-request.schema.json"])
        v.validate(
            {
                "v": 1,
                "id": "full-example",
                "revision": 3,
                "method": "media.render",
                "params": {"asset_id": "registered-source", "encoding": "review"},
            }
        )

    def test_rejects_unknown_fields_and_sample_window(self):
        v = self.validator(self.schemas["worker-request.schema.json"])
        example = {
            "v": 1,
            "id": "full-example",
            "revision": 3,
            "method": "media.render",
            "params": {"asset_id": "registered-source", "encoding": "review"},
        }
        example["params"]["shell"] = "anything"
        self.assertFalse(v.is_valid(example))
        del example["params"]["shell"]
        # A render window is no longer part of the current request shape.
        example["params"]["start_ms"] = 0
        example["params"]["end_ms"] = 1000
        self.assertFalse(v.is_valid(example))

    def test_cue_shape_and_semantics(self):
        cues = [{"id": "a", "start_ms": 10, "end_ms": 20, "text": "Tiếng Việt\nEnglish"}]
        self.validator(self.schemas["cues.schema.json"]).validate(cues)
        validate_cues(cues)
        cues[0]["end_ms"] = 5
        with self.assertRaises(WorkerError):
            validate_cues(cues)

    def test_result_envelope(self):
        v = self.validator(self.schemas["worker-event.schema.json"])
        self.assertTrue(
            v.is_valid(
                {
                    "v": 1,
                    "id": "a",
                    "revision": 0,
                    "event": "progress",
                    "data": {"phase": "rendering", "fraction": None},
                }
            )
        )
        self.assertFalse(
            v.is_valid(
                {
                    "v": 1,
                    "id": "a",
                    "revision": 0,
                    "event": "progress",
                    "data": {"phase": "rendering", "fraction": 2},
                }
            )
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
