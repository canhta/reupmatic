"""Synthesis manifest, bounds, artifact metadata and unchanged-source contracts."""

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
from runtime.errors import WorkerError
from speech.synthesis.contracts import parse_options, validate_audio
from speech.synthesis.models import SynthesisRegistry, read_voices, verify_bundle
from synthesis_fixture import bundle, params


class SynthesisContractTests(unittest.TestCase):
    def test_strict_spoken_input(self):
        p = params("a" * 64)
        self.assertEqual(parse_options(p), p)
        for patch in (
            {"source_layer": "displayed"},
            {"language": "zh"},
            {"language": []},
            {"model_id": "../model"},
            {"source_token": "x"},
            {"voice_id": ""},
            {"path": "/private"},
            {"cues": []},
            {"cues": [p["cues"][0], p["cues"][0]]},
            {"cues": [{**p["cues"][0], "text": "x" * 301}]},
            {"cues": [{**p["cues"][0], "text": "\ud800"}]},
        ):
            with self.subTest(patch=patch), self.assertRaises(WorkerError):
                parse_options({**p, **patch})

    def test_frame_spans_must_exactly_cover_all_cues_and_gaps(self):
        p = params("a" * 64)
        valid = {
            "frames": 21600,
            "segments": [
                {"cue_id": "cue-1", "start_frame": 0, "end_frame": 4800},
                {"cue_id": "cue-2", "start_frame": 16800, "end_frame": 21600},
            ],
            "runtime": "controlled-sdk",
        }
        self.assertEqual(validate_audio(valid, p), valid)
        for patch in (
            {"frames": True},
            {"frames": 0},
            {"frames": 21599},
            {"segments": []},
            {"segments": valid["segments"][::-1]},
            {"runtime": ""},
            {"path": "/source"},
        ):
            with (
                self.subTest(patch=patch),
                self.assertRaisesRegex(WorkerError, "MODEL_OUTPUT_INVALID"),
            ):
                validate_audio({**valid, **patch}, p)


class SynthesisModelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.manifest, self.directory = bundle(self.root)
        self.registry = SynthesisRegistry(self.manifest)

    def tearDown(self):
        self.temp.cleanup()

    def test_identity_is_hash_based_and_status_is_not_quality_verification(self):
        bundle = self.registry.read()
        self.assertEqual(len(bundle["model_id"]), 64)
        verify_bundle(bundle)
        status = self.registry.status()
        self.assertFalse(status["verified"])
        self.assertEqual(status["voices"], [{"id": "test-voice", "label": "Controlled voice"}])

    def test_changed_hash_and_extra_files_are_rejected(self):
        bundle = self.registry.read()
        path = self.directory / "onnx/vieneu_prefill.onnx"
        path.write_bytes(b"changed")
        with self.assertRaisesRegex(WorkerError, "MODEL_HASH_MISMATCH"):
            verify_bundle(bundle)
        (self.directory / "untrusted.py").write_text("")
        with self.assertRaisesRegex(WorkerError, "SYNTHESIS_MANIFEST_INVALID"):
            self.registry.read()

    def test_symlink_and_traversal_cannot_enter_bundle(self):
        path = self.directory / "onnx/vieneu_prefill.onnx"
        path.unlink()
        path.symlink_to(self.manifest)
        with self.assertRaisesRegex(WorkerError, "SYNTHESIS_MANIFEST_INVALID"):
            self.registry.read()
        value = json.loads(self.manifest.read_text())
        value["files"]["../outside"] = "a" * 64
        self.manifest.write_text(json.dumps(value))
        with self.assertRaisesRegex(WorkerError, "SYNTHESIS_MANIFEST_INVALID"):
            self.registry.read()

    def test_numeric_voice_data_must_be_bounded_finite_and_nonzero(self):
        path = self.directory / "voices.json"
        original = json.loads(path.read_text())
        for patch in (
            {"speaker_emb": [0] * 192},
            {"speaker_emb": [float("nan")] * 192},
            {"speaker_emb": [1] * 191},
            {"ref_codes": [[-1] * 8]},
            {"ref_codes": [[]]},
            {"ref_codes": [[1] * 8, [1] * 7]},
            {"id": "bad\x00id"},
        ):
            value = copy.deepcopy(original)
            value["voices"][0].update(patch)
            path.write_text(json.dumps(value))
            with (
                self.subTest(patch=patch),
                self.assertRaisesRegex(WorkerError, "SYNTHESIS_VOICES_INVALID"),
            ):
                read_voices(self.directory)

    def test_cancellable_hash_verification(self):
        bundle = self.registry.read()

        def cancelled():
            raise WorkerError("CANCELLED")

        with self.assertRaisesRegex(WorkerError, "CANCELLED"):
            verify_bundle(bundle, cancelled)
