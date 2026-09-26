import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch as mock_patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from runtime.errors import WorkerError
from speech.synthesis.contracts import parse_options, parse_voice, validate_audio
from speech.synthesis.hosted import idempotency_key
from speech.synthesis.models import (
    ENGINES,
    SynthesisRegistry,
    materialise_voices,
    read_nano_voices,
    read_voices,
    verify_bundle,
)
from synthesis_fixture import bundle, nano_bundle, params, sdk


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

    def test_a_cloned_voice_payload_rides_optional_and_is_bounded_like_the_bundle_format(self):
        p = params("a" * 64)
        voice = {"speaker_emb": [0.5] * 192, "ref_codes": [[1] * 8] * 2}
        self.assertEqual(parse_voice(voice), voice)
        self.assertEqual(parse_options({**p, "voice": voice})["voice"], voice)
        # The payload is excluded from the 63000-byte text bound a 500x32 reference would exceed.
        large = {"speaker_emb": [0.5] * 192, "ref_codes": [[65535] * 32] * 500}
        self.assertEqual(parse_options({**p, "voice": large})["voice"], large)
        for patch in (
            {"speaker_emb": [0.5] * 191},
            {"speaker_emb": [0] * 192},
            {"ref_codes": []},
            {"ref_codes": [[-1]]},
            {"ref_codes": [[1], [1, 2]]},
            "not-a-dict",
        ):
            bad = patch if isinstance(patch, str) else {**voice, **patch}
            with (
                self.subTest(patch=patch),
                self.assertRaisesRegex(WorkerError, "SYNTHESIS_CLONE_INVALID"),
            ):
                parse_options({**p, "voice": bad})

    def test_a_hosted_provider_and_credential_travel_together_and_never_beside_a_clone(self):
        p = {**params("a" * 64), "model_id": "c" * 64}
        provider = {"protocol": "vieneu", "endpoint_host": "api.vieneu.io"}
        hosted = parse_options({**p, "provider": provider, "credential": "vn_test_key"})
        self.assertEqual(hosted["provider"], provider)
        self.assertEqual(hosted["credential"], "vn_test_key")
        for patch in (
            {"provider": provider},
            {"credential": "vn_test_key"},
            {
                "provider": provider,
                "credential": "vn_test_key",
                "voice": {"speaker_emb": [0.5] * 192, "ref_codes": [[1] * 8]},
            },
            {
                "provider": {"protocol": "other", "endpoint_host": "api.vieneu.io"},
                "credential": "k",
            },
            {"provider": {"protocol": "vieneu", "endpoint_host": "host/path"}, "credential": "k"},
            {"provider": {"protocol": "vieneu", "endpoint_host": "bad host"}, "credential": "k"},
            {"provider": {**provider, "extra": 1}, "credential": "k"},
            {"provider": provider, "credential": ""},
        ):
            with self.subTest(patch=patch), self.assertRaisesRegex(WorkerError, "INVALID_REQUEST"):
                parse_options({**p, **patch})

    def test_a_retry_of_the_same_request_reuses_the_cue_key_and_a_different_cue_does_not(self):
        cue = {"id": "cue-1", "text": "Xin chào", "start_ms": 0, "end_ms": 1000}
        first = idempotency_key("request-12345678", cue)
        self.assertEqual(idempotency_key("request-12345678", cue), first)
        self.assertRegex(first, r"^[A-Za-z0-9_-]{8,128}$")
        self.assertNotEqual(idempotency_key("request-87654321", cue), first)
        self.assertNotEqual(idempotency_key("request-12345678", {**cue, "text": "Khác"}), first)

    def test_frame_spans_must_exactly_cover_all_cues_and_reported_spacing(self):
        p = params("a" * 64)
        valid = {
            "sample_rate": 48000,
            "frames": 21600,
            "segments": [
                {"cue_id": "cue-1", "start_frame": 0, "end_frame": 4800, "lead_silence_frames": 0},
                {
                    "cue_id": "cue-2",
                    "start_frame": 16800,
                    "end_frame": 21600,
                    "lead_silence_frames": 12000,
                },
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
            {
                "segments": [
                    {**valid["segments"][0], "lead_silence_frames": 1},
                    valid["segments"][1],
                ]
            },
            {"segments": [{**valid["segments"][0], "extra": True}, valid["segments"][1]]},
            {"segments": [{**valid["segments"][0], "start_frame": 1}, valid["segments"][1]]},
        ):
            with (
                self.subTest(patch=patch),
                self.assertRaisesRegex(WorkerError, "MODEL_OUTPUT_INVALID"),
            ):
                validate_audio({**valid, **patch}, p)

    def test_a_rate_this_build_cannot_produce_has_its_own_refusal(self):
        p = params("a" * 64)
        valid = {
            "sample_rate": 48000,
            "frames": 4800,
            "segments": [
                {"cue_id": "cue-1", "start_frame": 0, "end_frame": 2400, "lead_silence_frames": 0},
                {
                    "cue_id": "cue-2",
                    "start_frame": 3600,
                    "end_frame": 4800,
                    "lead_silence_frames": 1200,
                },
            ],
            "runtime": "controlled-sdk",
        }
        self.assertEqual(validate_audio(valid, p), valid)
        for rate in (12345, 96000, 0, True, "48000"):
            with (
                self.subTest(rate=rate),
                self.assertRaisesRegex(
                    WorkerError,
                    "SYNTHESIS_SAMPLE_RATE_UNSUPPORTED"
                    if type(rate) is int and rate not in (0,)
                    else "MODEL_OUTPUT_INVALID",
                ),
            ):
                validate_audio({**valid, "sample_rate": rate}, p)
        supported = {**valid, "sample_rate": 24000}
        self.assertEqual(validate_audio(supported, p)["sample_rate"], 24000)


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


class NanoSynthesisModelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.manifest, self.directory = nano_bundle(self.root)
        self.registry = SynthesisRegistry(self.manifest)
        self.sdk = sdk(self.root)
        sys.path.insert(0, str(self.sdk))

    def tearDown(self):
        sys.path.remove(str(self.sdk))
        self.temp.cleanup()

    def test_the_registry_offers_both_architectures_and_the_nano_one_targets_duration(self):
        self.assertEqual(
            set(ENGINES),
            {"vieneu-v3-turbo-onnx", "vieneu-v3-nano-onnx", "vieneu-v3-turbo-clone-onnx"},
        )
        self.assertFalse(ENGINES["vieneu-v3-turbo-onnx"].targets_duration)
        self.assertTrue(ENGINES["vieneu-v3-nano-onnx"].targets_duration)
        # The clone add-on is a companion descriptor, never a synthesis engine of its own.
        self.assertEqual(ENGINES["vieneu-v3-turbo-clone-onnx"].adapter.__name__, "_clone_adapter")

    def test_a_nano_bundle_reads_with_its_own_layout_voices_and_engine(self):
        bundle = self.registry.read()
        self.assertEqual(bundle["engine"], "vieneu-v3-nano-onnx")
        self.assertEqual(len(bundle["model_id"]), 64)
        verify_bundle(bundle)
        status = self.registry.status()
        self.assertTrue(status["available"])
        self.assertEqual(status["engine"], "vieneu-v3-nano-onnx")
        self.assertEqual(status["languages"], ["vi"])
        self.assertEqual(status["voices"], [{"id": "test-voice", "label": "Controlled voice"}])

    def test_an_engine_this_build_cannot_run_is_refused_at_configuration_time(self):
        value = json.loads(self.manifest.read_text())
        value["engine"] = "some-unshipped-tts"
        self.manifest.write_text(json.dumps(value))
        with self.assertRaisesRegex(WorkerError, "SYNTHESIS_MANIFEST_INVALID"):
            self.registry.read()

    def test_a_bundle_with_another_engines_layout_is_refused_not_read_alongside(self):
        (self.directory / "extra.onnx").write_bytes(b"not part of the layout")
        with self.assertRaisesRegex(WorkerError, "SYNTHESIS_MANIFEST_INVALID"):
            self.registry.read()

    def test_a_language_the_architecture_cannot_serve_is_refused(self):
        value = json.loads(self.manifest.read_text())
        value["languages"] = ["en"]
        self.manifest.write_text(json.dumps(value))
        with self.assertRaisesRegex(WorkerError, "SYNTHESIS_MANIFEST_INVALID"):
            self.registry.read()

    def test_nano_voice_style_must_be_the_float_token_array_the_engine_consumes(self):
        path = self.directory / "voices.json"
        original = json.loads(path.read_text())
        for patch in (
            {"style": [[1, 2, 3]]},
            {"style": [[float("nan")] * 256]},
            {"style": []},
            {"speaker_emb": [0] * 192},
        ):
            value = copy.deepcopy(original)
            value["voices"][0].update(patch)
            path.write_text(json.dumps(value))
            with (
                self.subTest(patch=patch),
                self.assertRaisesRegex(WorkerError, "SYNTHESIS_VOICES_INVALID"),
            ):
                read_nano_voices(self.directory)


class MaterialiseVoicesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def downloaded(self, nano=False):
        manifest, directory = nano_bundle(self.root) if nano else bundle(self.root)
        (directory / "voices.json").unlink()
        value = json.loads(manifest.read_text())
        del value["files"]["voices.json"]
        manifest.write_text(json.dumps(value))
        return manifest, directory

    def with_presets(self, filename, presets):
        package = self.root / "sdk" / "vieneu"
        assets = package / "assets"
        assets.mkdir(parents=True)
        (assets / filename).write_text(
            json.dumps({"default_voice": "Controlled", "meta": {}, "presets": presets}),
            encoding="utf-8",
        )
        return package

    def materialise(self, manifest, package):
        with mock_patch("speech.synthesis.models._sdk_packages_root", return_value=package):
            materialise_voices(manifest)

    def test_a_downloaded_turbo_bundle_is_completed_from_the_sdk_presets(self):
        manifest, directory = self.downloaded()
        presets = {"Minh Đức": {"speaker_emb": [0.5] * 192, "codes": [[1] * 16] * 50}}
        self.materialise(manifest, self.with_presets("voices_v3_turbo.json", presets))
        written = directory / "voices.json"
        self.assertTrue(written.is_file())
        declared = json.loads(manifest.read_text())["files"]
        self.assertEqual(declared["voices.json"], hashlib.sha256(written.read_bytes()).hexdigest())
        finished = SynthesisRegistry(manifest).read()
        verify_bundle(finished)
        self.assertEqual([v["id"] for v in read_voices(directory)], ["Minh Đức"])

    def test_a_downloaded_nano_bundle_converts_to_the_float_style_schema(self):
        manifest, directory = self.downloaded(nano=True)
        presets = {"Adam": {"speaker_emb": [0.5] * 192, "style": [[0.01] * 256] * 50}}
        self.materialise(manifest, self.with_presets("voices_v3_nano.json", presets))
        finished = SynthesisRegistry(manifest).read()
        verify_bundle(finished)
        self.assertEqual([v["id"] for v in read_nano_voices(directory)], ["Adam"])

    def test_a_bundle_that_already_carries_voices_is_left_untouched(self):
        manifest, directory = bundle(self.root)
        before_manifest = manifest.read_text()
        before_voices = (directory / "voices.json").read_bytes()
        with mock_patch(
            "speech.synthesis.models._sdk_packages_root",
            side_effect=AssertionError("the SDK must not be read for a complete bundle"),
        ):
            materialise_voices(manifest)
        self.assertEqual(manifest.read_text(), before_manifest)
        self.assertEqual((directory / "voices.json").read_bytes(), before_voices)

    def test_a_missing_sdk_fails_loudly_and_writes_no_bundle(self):
        manifest, directory = self.downloaded()
        before = manifest.read_text()
        with mock_patch(
            "speech.synthesis.models._sdk_packages_root", return_value=self.root / "absent"
        ):
            with self.assertRaisesRegex(WorkerError, "SYNTHESIS_VOICES_UNAVAILABLE"):
                materialise_voices(manifest)
        self.assertFalse((directory / "voices.json").exists())
        self.assertEqual(manifest.read_text(), before)
