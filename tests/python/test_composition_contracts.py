import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from media.composition.document import parse_composition
from runtime.errors import WorkerError

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(importlib.util.find_spec("jsonschema"), "test-only jsonschema missing")
class CompositionContracts(unittest.TestCase):
    def setUp(self):
        from jsonschema import Draft202012Validator

        self.validator = Draft202012Validator
        self.source = {
            "path": "/video.mp4",
            "name": "video.mp4",
            "sha256": "a" * 64,
            "duration_ms": 2000,
        }
        self.clip = {
            "id": "clip-a",
            "source": self.source,
            "start_ms": 0,
            "end_ms": 2000,
            "speed": 1,
            "enabled": True,
        }
        self.composition = {
            "canvas": {"width": 320, "height": 180, "fps": 30},
            "clips": [self.clip],
        }

    def test_persisted_project_and_transport_are_distinct_and_strict(self):
        schema = json.loads((ROOT / "contracts/editing/composition.schema.json").read_text())
        self.validator.check_schema(schema)
        self.validator(schema).validate(self.composition)
        project = {
            "format": "reupmatic.project",
            "source": {"path": "/video.mp4", "sha256": "a" * 64},
            "cues": [],
            "composition": self.composition,
        }
        self.validator(json.loads((ROOT / "contracts/project.schema.json").read_text())).validate(
            project
        )
        transport = copy.deepcopy(self.composition)
        transport["clips"][0]["source"] = {
            "asset_id": "registered-a",
            "sha256": "a" * 64,
            "duration_ms": 2000,
        }
        document, spans, duration = parse_composition(transport)
        self.assertEqual(duration, 2000)
        self.assertEqual(len(spans), 1)
        request = {
            "v": 1,
            "id": "render-a",
            "revision": 0,
            "method": "media.render",
            "params": {
                "asset_id": "registered-a",
                "encoding": "review",
                "composition": document,
            },
        }
        validator = self.validator(
            json.loads((ROOT / "contracts/worker-request.schema.json").read_text())
        )
        validator.validate(request)
        request["params"]["composition"] = self.composition
        self.assertFalse(validator.is_valid(request))
        with self.assertRaises(WorkerError):
            parse_composition(self.composition)

    def test_semantics_reject_duplicate_ids_short_ranges_and_invalid_numbers(self):
        transport = copy.deepcopy(self.composition)
        transport["clips"][0]["source"] = {
            "asset_id": "registered-a",
            "sha256": "a" * 64,
            "duration_ms": 2000,
        }
        for modify in [
            lambda value: value["clips"].append(copy.deepcopy(value["clips"][0])),
            lambda value: value["clips"][0].update(end_ms=99),
            lambda value: value["clips"][0].update(speed=True),
            lambda value: value["clips"][0].update(end_ms=2001),
            lambda value: value["canvas"].update(width=319),
            lambda value: value["canvas"].update(fps=60),
            lambda value: value["clips"][0].pop("enabled"),
            lambda value: value["clips"][0].update(enabled="yes"),
        ]:
            invalid = copy.deepcopy(transport)
            modify(invalid)
            with self.assertRaises(WorkerError):
                parse_composition(invalid)
