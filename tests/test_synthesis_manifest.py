"""Local manifest tooling never downloads, overwrites or accepts unusable presets."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'worker'))
from synthesis_fixture import bundle
from speech.synthesis.models import SynthesisRegistry

SPEC = importlib.util.spec_from_file_location('synthesis_manifest', Path(__file__).parents[1] / 'scripts/synthesis_manifest.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SynthesisManifestTests(unittest.TestCase):
    def test_generated_manifest_is_accepted_by_the_current_registry(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest, _ = bundle(root)
            directory = Path(json.loads(manifest.read_text())['directory'])
            target = root / 'generated.json'
            MODULE.create_manifest(directory, target, json.loads(manifest.read_text())['languages'])
            self.assertEqual(SynthesisRegistry(target).read()['model_id'], SynthesisRegistry(manifest).read()['model_id'])
            original = target.read_bytes()
            with self.assertRaises(FileExistsError):
                MODULE.create_manifest(directory, target, json.loads(manifest.read_text())['languages'])
            self.assertEqual(target.read_bytes(), original)

    def test_in_bundle_output_and_duplicate_language_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest, _ = bundle(root)
            directory = Path(json.loads(manifest.read_text())['directory'])
            with self.assertRaises(ValueError):
                MODULE.create_manifest(directory, directory / 'manifest.json', ['vi'])
            with self.assertRaises(ValueError):
                MODULE.create_manifest(directory, root / 'duplicate.json', ['vi', 'vi'])
            self.assertFalse((root / 'duplicate.json').exists())
