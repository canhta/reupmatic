import copy
import importlib.util
import json
import unittest
from pathlib import Path

from test_translation import options

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(importlib.util.find_spec("jsonschema"), "test-only jsonschema required")
class TranslationContracts(unittest.TestCase):
    def setUp(self):
        from jsonschema import Draft202012Validator

        self.validator = Draft202012Validator
        self.defs = self.read("speech/translation.schema.json")["$defs"]
        self.worker = self.validator(self.read("worker-request.schema.json"))

    def read(self, name):
        return json.loads((ROOT / "contracts" / name).read_text(encoding="utf-8"))

    def test_public_and_worker_shapes_reject_paths_styles_auto_and_unknown_options(self):
        public = {"request_id": "request-123", "revision": 2, "params": options()}
        self.validator(self.defs["input"]).validate(public)
        request = {
            "v": 1,
            "id": "request-123",
            "revision": 2,
            "method": "speech.translate",
            "params": options(),
        }
        self.worker.validate(request)
        for change in [
            {"path": "/source.srt"},
            {"target_language": "auto"},
            {"model_id": "remote"},
            {"cues": []},
            {"rules": [{"find": "x", "replace": "y", "regex": True}]},
        ]:
            self.assertFalse(self.worker.is_valid({**request, "params": {**options(), **change}}))
        styled = copy.deepcopy(request)
        styled["params"]["cues"][0]["style"] = {}
        self.assertFalse(self.worker.is_valid(styled))
        self.worker.validate({**request, "method": "translation.status", "params": {}})
        self.worker.validate(
            {**request, "method": "translation.configure", "params": {"path": "/manifest.json"}}
        )

    def test_plain_result_and_lightweight_status_are_explicit(self):
        result = {**options(), "kind": "translation", "runtime": "controlled@1"}
        self.validator(self.defs["result"]).validate(result)
        result["cues"][0]["style"] = {}
        self.assertFalse(self.validator(self.defs["result"]).is_valid(result))
        status = {
            "available": True,
            "code": None,
            "model_id": "a" * 64,
            "source_language": "en",
            "target_language": "vi",
            "verified": False,
        }
        self.validator(self.defs["status"]).validate(status)
        for change in [
            {"verified": True},
            {"model_id": None},
            {"target_language": None},
            {"code": "MODEL_MISSING"},
        ]:
            self.assertFalse(self.validator(self.defs["status"]).is_valid({**status, **change}))

    def test_current_project_and_text_layer_versions_keep_translation_provenance(self):
        origin = {
            "kind": "translation",
            "layer": "transcript",
            "token": "source-123",
            "request_id": "request-123",
            "source_language": "en",
            "target_language": "vi",
            "model_id": "a" * 64,
            "runtime": "controlled@1",
            "rules": [{"find": "x", "replace": "y"}],
            "policy": "keep-existing",
        }
        self.validator(self.defs["origin"]).validate(origin)
        meta = {
            "token": "target-123",
            "language": "vi",
            "origin": {"kind": "manual"},
            "edited": False,
            "stale": False,
            "visible": False,
        }
        layers = {
            "displayed": meta,
            **{name: {**meta, "cues": []} for name in ["transcript", "translated", "spoken"]},
        }
        layers["translated"]["origin"] = origin
        project = {
            "format": "reupmatic.project",
            "source": {"path": "/source.mp4", "sha256": "a" * 64},
            "cues": [],
            "sample": {"start_ms": 0, "end_ms": 1000},
            "text_layers": layers,
        }
        schema = self.validator(self.read("project.schema.json"))
        schema.validate(project)
        for key in ["policy", "model_id", "rules", "runtime"]:
            invalid = copy.deepcopy(project)
            del invalid["text_layers"]["translated"]["origin"][key]
            self.assertFalse(schema.is_valid(invalid))

    def test_bundle_accepts_exactly_one_hashed_vocabulary_layout(self):
        schema = self.validator(self.read("speech/translation-model.schema.json"))
        files = {key: "a" * 64 for key in ["model.bin", "config.json", "source.spm", "target.spm"]}
        bundle = {
            "engine": "ctranslate2-sentencepiece",
            "directory": "local/model",
            "source_language": "en",
            "target_language": "vi",
            "files": {**files, "shared_vocabulary.json": "a" * 64},
        }
        schema.validate(bundle)
        schema.validate(
            {
                **bundle,
                "files": {
                    **files,
                    "source_vocabulary.json": "a" * 64,
                    "target_vocabulary.json": "b" * 64,
                },
            }
        )
        for directory in ["https://host/model", "//host/model", "\\\\host\\model"]:
            self.assertFalse(schema.is_valid({**bundle, "directory": directory}))
        self.assertFalse(schema.is_valid({**bundle, "files": files}))
        self.assertFalse(
            schema.is_valid(
                {**bundle, "files": {**bundle["files"], "source_vocabulary.json": "a" * 64}}
            )
        )
