import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from runtime.errors import WorkerError
from vision.configuration import configure_models, merge_models, unconfigure_models
from vision.models import ModelRegistry


class ModelConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.host = SimpleNamespace(
            workspace=self.root / "workspace",
            models=ModelRegistry(self.root / "missing.json"),
            cancelled=lambda req: None,
        )
        self.host.workspace.mkdir()
        self.weights = self.root / "model.onnx"
        self.weights.write_bytes(b"test artifact, not a real model")
        self.manifest = self.root / "local.json"
        self.value = {
            "inpainting": {
                "model": {
                    "path": "model.onnx",
                    "sha256": hashlib.sha256(self.weights.read_bytes()).hexdigest(),
                }
            },
        }
        self.manifest.write_text(json.dumps(self.value), encoding="utf-8")

    def configure(self):
        with patch.dict(os.environ, {}, clear=True):
            return configure_models(
                self.host, {"id": "configure", "params": {"path": str(self.manifest)}}
            )

    def test_valid_manifest_is_normalized_and_retained_without_copying_weights(self):
        result = self.configure()
        saved = json.loads((self.host.workspace / "local-models.json").read_text())
        self.assertEqual(saved["inpainting"]["model"]["path"], str(self.weights))
        self.assertEqual(self.host.models.manifest, self.host.workspace / "local-models.json")
        self.assertTrue(self.weights.is_file())
        self.assertFalse(result["models"]["inpainting"]["verified"])

    def test_bad_checksum_keeps_previous_configuration(self):
        self.configure()
        before = self.host.models.manifest.read_bytes()
        self.weights.write_bytes(b"changed bytes")
        with self.assertRaisesRegex(WorkerError, "MODEL_HASH_MISMATCH"):
            self.configure()
        self.assertEqual(self.host.models.manifest.read_bytes(), before)

    def test_empty_configuration_and_urls_are_not_accepted(self):
        self.manifest.write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(WorkerError, "MODEL_MANIFEST_INVALID"):
            self.configure()
        with self.assertRaisesRegex(WorkerError, "INVALID_REQUEST"):
            configure_models(
                self.host, {"id": "config", "params": {"path": "https://example.test/model.json"}}
            )

    def test_cancellation_does_not_replace_existing_configuration(self):
        self.configure()
        before = self.host.models.manifest.read_bytes()

        def cancel(req):
            raise WorkerError("CANCELLED")

        self.host.cancelled = cancel
        with self.assertRaisesRegex(WorkerError, "CANCELLED"):
            self.configure()
        self.assertEqual(self.host.models.manifest.read_bytes(), before)

    def test_environment_override_is_explicit_and_does_not_get_overwritten(self):
        with patch.dict(os.environ, {"REUPMATIC_MODEL_MANIFEST": str(self.manifest)}):
            with self.assertRaisesRegex(WorkerError, "MODEL_CONFIG_OVERRIDE"):
                configure_models(
                    self.host, {"id": "config", "params": {"path": str(self.manifest)}}
                )

    def test_unconfigure_forgets_only_a_bundle_under_that_directory(self):
        self.configure()
        target = self.host.workspace / "local-models.json"
        self.assertTrue(target.exists())
        unconfigure_models(self.host, {"params": {"directory": str(self.root / "elsewhere")}})
        self.assertTrue(target.exists())
        result = unconfigure_models(self.host, {"params": {"directory": str(self.root)}})
        self.assertFalse(target.exists())
        self.assertFalse(result["configured"])

    def _ocr_manifest(self):
        ocr_dir = self.root / "ocr"
        ocr_dir.mkdir()
        files = {}
        for name in ("det.onnx", "rec.onnx", "keys.txt"):
            data = f"ocr-{name}".encode()
            (ocr_dir / name).write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
        manifest = self.root / "ocr.json"
        manifest.write_text(
            json.dumps(
                {
                    "ocr": {
                        "vi": {
                            "det": {"path": "ocr/det.onnx", "sha256": files["det.onnx"]},
                            "rec": {"path": "ocr/rec.onnx", "sha256": files["rec.onnx"]},
                            "keys": {"path": "ocr/keys.txt", "sha256": files["keys.txt"]},
                            "det_version": "PP-OCRv5",
                            "rec_version": "PP-OCRv5",
                            "rec_height": 48,
                        }
                    }
                }
            ),
            encoding="utf-8",
        )
        return manifest, ocr_dir

    def test_merge_adds_a_capability_without_erasing_the_other(self):
        self.configure()
        manifest, ocr_dir = self._ocr_manifest()
        with patch.dict(os.environ, {}, clear=True):
            result = merge_models(self.host, {"id": "merge", "params": {"path": str(manifest)}})
        saved = json.loads((self.host.workspace / "local-models.json").read_text())
        self.assertIn("inpainting", saved, "the earlier capability survives the merge")
        self.assertIn("ocr", saved)
        self.assertTrue(result["configured"])
        unconfigure_models(self.host, {"params": {"directory": str(ocr_dir)}})
        remaining = json.loads((self.host.workspace / "local-models.json").read_text())
        self.assertNotIn("ocr", remaining)
        self.assertIn("inpainting", remaining)


if __name__ == "__main__":
    unittest.main()
