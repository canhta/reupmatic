import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from runtime.errors import WorkerError
from speech.recognition.models import (
    SpeechEngines,
    configure_speech,
    read_manifest,
    unconfigure_speech,
)
from speech.recognition.service import parse_options
from speech.recognition.timestamps import timed_segments


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.directory = self.root / "model"
        self.directory.mkdir()
        self.files = {}
        for name in ("config.json", "model.bin", "tokenizer.json", "vocabulary.json"):
            data = b"controlled-test-model-file"
            (self.directory / name).write_bytes(data)
            self.files[name] = hashlib.sha256(data).hexdigest()
        self.value = {
            "engine": "faster-whisper",
            "directory": "model",
            "languages": ["en", "vi", "zh"],
            "files": self.files,
        }
        self.manifest = self.root / "manifest.json"
        self.manifest.write_text(json.dumps(self.value))

    def test_manifest_is_strict_and_resolves_local_files(self):
        bundle = read_manifest(self.manifest)
        self.assertEqual(bundle["engine"], "faster-whisper")
        self.assertEqual(bundle["directory"], str(self.directory))
        self.assertEqual(len(bundle["model_id"]), 64)
        self.assertEqual(bundle["files"], self.files)
        # Pinned: an engine-seam refactor must not silently change bundle identity.
        self.assertEqual(
            bundle["model_id"], "ad7374bd46eb491fb99bafcd5674b82f3d61902712bc76696f43277e94268d1a"
        )
        for changes in (
            {"command": "execute"},
            {"directory": "https://example.com/model"},
            {"languages": ["auto"]},
            {"languages": ["vi", "vi"]},
            {"files": {"../model.bin": "a" * 64}},
        ):
            self.manifest.write_text(json.dumps({**self.value, **changes}))
            with self.assertRaises(WorkerError):
                read_manifest(self.manifest)

    def test_qwen3_asr_manifest_validates_and_its_digest_differs_from_faster_whisper(self):
        directory = self.root / "qwen-model"
        directory.mkdir()
        files = {}
        for name in (
            "config.json",
            "tokenizer_config.json",
            "vocab.json",
            "merges.txt",
            "model.safetensors",
        ):
            data = b"controlled-test-model-file-" + name.encode()
            (directory / name).write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
        manifest = self.root / "qwen-manifest.json"
        manifest.write_text(
            json.dumps(
                {
                    "engine": "qwen3-asr",
                    "directory": "qwen-model",
                    "languages": ["en", "vi", "zh"],
                    "files": files,
                }
            )
        )
        bundle = read_manifest(manifest)
        self.assertEqual(len(bundle["model_id"]), 64)
        whisper_bundle = read_manifest(self.manifest)
        self.assertNotEqual(bundle["model_id"], whisper_bundle["model_id"])

    def test_qwen3_forced_aligner_manifest_validates_with_the_same_file_set_as_qwen3_asr(self):
        # Matches the HF Qwen3-ForcedAligner-0.6B file listing; distinct engine digest.
        directory = self.root / "aligner-model"
        directory.mkdir()
        files = {}
        for name in (
            "config.json",
            "tokenizer_config.json",
            "vocab.json",
            "merges.txt",
            "model.safetensors",
        ):
            data = b"controlled-test-aligner-file-" + name.encode()
            (directory / name).write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
        manifest = self.root / "aligner-manifest.json"
        manifest.write_text(
            json.dumps(
                {
                    "engine": "qwen3-forced-aligner",
                    "directory": "aligner-model",
                    "languages": ["vi"],
                    "files": files,
                }
            )
        )
        bundle = read_manifest(manifest)
        self.assertEqual(len(bundle["model_id"]), 64)
        same_files_as_asr = self.root / "as-asr-manifest.json"
        same_files_as_asr.write_text(
            json.dumps(
                {
                    "engine": "qwen3-asr",
                    "directory": "aligner-model",
                    "languages": ["vi"],
                    "files": files,
                }
            )
        )
        as_asr = read_manifest(same_files_as_asr)
        self.assertNotEqual(bundle["model_id"], as_asr["model_id"])

    def test_changed_or_unlisted_runtime_files_are_not_trusted(self):
        (self.directory / "model.bin").write_bytes(b"changed")
        bundle = read_manifest(self.manifest)
        with self.assertRaisesRegex(WorkerError, "MODEL_HASH_MISMATCH"):
            from speech.recognition.models import verify_bundle

            verify_bundle(bundle)
        (self.directory / "model.bin").write_bytes(b"controlled-test-model-file")
        (self.directory / "preprocessor_config.json").write_text("{}")
        with self.assertRaisesRegex(WorkerError, "SPEECH_MANIFEST_INVALID"):
            read_manifest(self.manifest)

    def test_symlink_escape_is_rejected(self):
        outside = self.root / "outside.bin"
        outside.write_bytes(b"controlled-test-model-file")
        (self.directory / "model.bin").unlink()
        (self.directory / "model.bin").symlink_to(outside)
        with self.assertRaisesRegex(WorkerError, "SPEECH_MANIFEST_INVALID"):
            read_manifest(self.manifest)

    def test_missing_manifest_is_model_missing(self):
        with self.assertRaisesRegex(WorkerError, "MODEL_MISSING"):
            read_manifest(self.root / "does-not-exist.json")


class SpeechEnginesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.target = self.workspace / "local-speech.json"

        self.whisper_dir = self.root / "whisper-model"
        self.whisper_dir.mkdir()
        self.whisper_files = {}
        for name in ("config.json", "model.bin", "tokenizer.json", "vocabulary.json"):
            data = b"controlled-test-model-file"
            (self.whisper_dir / name).write_bytes(data)
            self.whisper_files[name] = hashlib.sha256(data).hexdigest()
        self.whisper_manifest = self.root / "whisper-manifest.json"
        self.whisper_manifest.write_text(
            json.dumps(
                {
                    "engine": "faster-whisper",
                    "directory": str(self.whisper_dir),
                    "languages": ["en", "vi", "zh"],
                    "files": self.whisper_files,
                }
            )
        )

        self.qwen_dir = self.root / "qwen-model"
        self.qwen_dir.mkdir()
        self.qwen_files = {}
        for name in (
            "config.json",
            "tokenizer_config.json",
            "vocab.json",
            "merges.txt",
            "model.safetensors",
        ):
            data = b"controlled-test-model-file-" + name.encode()
            (self.qwen_dir / name).write_bytes(data)
            self.qwen_files[name] = hashlib.sha256(data).hexdigest()
        self.qwen_manifest = self.root / "qwen-manifest.json"
        self.qwen_manifest.write_text(
            json.dumps(
                {
                    "engine": "qwen3-asr",
                    "directory": str(self.qwen_dir),
                    "languages": ["en", "vi", "zh"],
                    "files": self.qwen_files,
                }
            )
        )

        self.aligner_dir = self.root / "aligner-model"
        self.aligner_dir.mkdir()
        self.aligner_files = {}
        for name in (
            "config.json",
            "tokenizer_config.json",
            "vocab.json",
            "merges.txt",
            "model.safetensors",
        ):
            data = b"controlled-test-aligner-file-" + name.encode()
            (self.aligner_dir / name).write_bytes(data)
            self.aligner_files[name] = hashlib.sha256(data).hexdigest()
        self.aligner_manifest = self.root / "aligner-manifest.json"
        self.aligner_manifest.write_text(
            json.dumps(
                {
                    "engine": "qwen3-forced-aligner",
                    "directory": str(self.aligner_dir),
                    "languages": ["vi"],
                    "files": self.aligner_files,
                }
            )
        )

        self.host = SimpleNamespace(
            workspace=self.workspace,
            speech_models=SpeechEngines(self.target),
            cancelled=lambda _: None,
        )

    def configure(self, manifest: Path) -> dict:
        return configure_speech(self.host, {"params": {"path": str(manifest)}})

    def test_status_of_an_unconfigured_store_lists_every_known_engine_as_missing(self):
        status = SpeechEngines(self.target).status()
        names = {entry["engine"] for entry in status["engines"]}
        self.assertEqual(names, {"faster-whisper", "qwen3-asr", "qwen3-forced-aligner"})
        for entry in status["engines"]:
            self.assertFalse(entry["available"])
            self.assertEqual(entry["code"], "MODEL_MISSING")
            self.assertIsNone(entry["model_id"])
            self.assertEqual(entry["languages"], [])

    def test_configuring_a_second_engine_keeps_the_first_intact(self):
        with (
            patch("speech.recognition.models.runtime_available", return_value=True),
            patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=True),
        ):
            self.configure(self.whisper_manifest)
            status = self.configure(self.qwen_manifest)
        by_engine = {entry["engine"]: entry for entry in status["engines"]}
        self.assertTrue(by_engine["faster-whisper"]["available"])
        self.assertTrue(by_engine["qwen3-asr"]["available"])
        self.assertIsNotNone(by_engine["faster-whisper"]["model_id"])
        self.assertNotEqual(
            by_engine["faster-whisper"]["model_id"], by_engine["qwen3-asr"]["model_id"]
        )

    def test_reconfiguring_one_engine_does_not_change_the_others_model_id(self):
        with (
            patch("speech.recognition.models.runtime_available", return_value=True),
            patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=True),
        ):
            self.configure(self.whisper_manifest)
            status = self.configure(self.qwen_manifest)
            first_whisper_id = next(
                e["model_id"] for e in status["engines"] if e["engine"] == "faster-whisper"
            )
            (self.whisper_dir / "model.bin").write_bytes(b"a different weight file")
            self.whisper_files["model.bin"] = hashlib.sha256(b"a different weight file").hexdigest()
            self.whisper_manifest.write_text(
                json.dumps(
                    {
                        "engine": "faster-whisper",
                        "directory": str(self.whisper_dir),
                        "languages": ["en", "vi", "zh"],
                        "files": self.whisper_files,
                    }
                )
            )
            status = self.configure(self.whisper_manifest)
        by_engine = {entry["engine"]: entry for entry in status["engines"]}
        self.assertNotEqual(by_engine["faster-whisper"]["model_id"], first_whisper_id)
        self.assertEqual(
            by_engine["qwen3-asr"]["model_id"],
            SpeechEngines(self.target).status()["engines"][1]["model_id"],
        )

    def test_old_single_engine_store_shape_fails_loudly_never_migrated(self):
        self.target.write_text(
            json.dumps(
                {
                    "engine": "faster-whisper",
                    "directory": str(self.whisper_dir),
                    "languages": ["en", "vi", "zh"],
                    "files": self.whisper_files,
                }
            )
        )
        status = SpeechEngines(self.target).status()
        for entry in status["engines"]:
            self.assertEqual(entry["code"], "SPEECH_MANIFEST_INVALID")
            self.assertFalse(entry["available"])
        self.host.speech_models = SpeechEngines(self.target)
        with self.assertRaisesRegex(WorkerError, "SPEECH_MANIFEST_INVALID"):
            self.configure(self.qwen_manifest)

    def test_require_resolves_the_engine_owning_the_requested_model_id_and_refuses_others(self):
        with (
            patch("speech.recognition.models.runtime_available", return_value=True),
            patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=True),
        ):
            self.configure(self.whisper_manifest)
            status = self.configure(self.qwen_manifest)
        engines = SpeechEngines(self.target)
        by_engine = {entry["engine"]: entry for entry in status["engines"]}
        with (
            patch("speech.recognition.models.runtime_available", return_value=True),
            patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=True),
        ):
            whisper_bundle = engines.require(by_engine["faster-whisper"]["model_id"], "vi")
            qwen_bundle = engines.require(by_engine["qwen3-asr"]["model_id"], "vi")
        self.assertEqual(whisper_bundle["engine"], "faster-whisper")
        self.assertEqual(qwen_bundle["engine"], "qwen3-asr")
        with self.assertRaisesRegex(WorkerError, "SPEECH_MODEL_CHANGED"):
            engines.require("a" * 64, "vi")

    def test_require_refuses_absent_runtime_before_verifying_or_decoding(self):
        with patch("speech.recognition.models.runtime_available", return_value=True):
            status = self.configure(self.whisper_manifest)
        model_id = status["engines"][0]["model_id"]
        engines = SpeechEngines(self.target)
        with patch("speech.recognition.models.runtime_available", return_value=False):
            with self.assertRaisesRegex(WorkerError, "MODEL_RUNTIME_MISSING"):
                engines.require(model_id, "vi")

    def test_require_refuses_unsupported_language_for_the_owning_engine(self):
        self.whisper_manifest.write_text(
            json.dumps(
                {
                    "engine": "faster-whisper",
                    "directory": str(self.whisper_dir),
                    "languages": ["en"],
                    "files": self.whisper_files,
                }
            )
        )
        with patch("speech.recognition.models.runtime_available", return_value=True):
            status = self.configure(self.whisper_manifest)
        model_id = status["engines"][0]["model_id"]
        engines = SpeechEngines(self.target)
        with self.assertRaisesRegex(WorkerError, "MODEL_LANGUAGE_UNAVAILABLE"):
            engines.require(model_id, "vi")

    def test_require_is_cancellable(self):
        def cancel():
            raise WorkerError("CANCELLED")

        engines = SpeechEngines(self.target)
        with self.assertRaisesRegex(WorkerError, "CANCELLED"):
            engines.require("a" * 64, "vi", check=cancel)

    def test_optional_is_none_when_a_companion_engine_is_simply_not_there_to_help(self):
        engines = SpeechEngines(self.target)
        self.assertIsNone(engines.optional("qwen3-forced-aligner", "vi"))
        with patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=True):
            self.configure(self.aligner_manifest)
        self.assertIsNone(engines.optional("qwen3-forced-aligner", "en"))
        with patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=False):
            self.assertIsNone(engines.optional("qwen3-forced-aligner", "vi"))

    def test_optional_returns_the_companion_bundle_once_it_is_actually_usable(self):
        engines = SpeechEngines(self.target)
        with patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=True):
            self.configure(self.aligner_manifest)
            bundle = engines.optional("qwen3-forced-aligner", "vi")
        self.assertEqual(bundle["engine"], "qwen3-forced-aligner")
        self.assertEqual(len(bundle["model_id"]), 64)

    def test_optional_still_fails_hard_on_a_tampered_companion_bundle(self):
        engines = SpeechEngines(self.target)
        with patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=True):
            self.configure(self.aligner_manifest)
        (self.aligner_dir / "model.safetensors").write_bytes(b"tampered")
        with (
            patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=True),
            self.assertRaisesRegex(WorkerError, "MODEL_HASH_MISMATCH"),
        ):
            engines.optional("qwen3-forced-aligner", "vi")

    def test_configuration_is_explicit_atomic_and_does_not_install_anything(self):
        self.target.write_text(json.dumps({"engines": {}}), encoding="utf-8")
        (self.whisper_dir / "model.bin").write_bytes(b"bad")
        with self.assertRaisesRegex(WorkerError, "MODEL_HASH_MISMATCH"):
            self.configure(self.whisper_manifest)
        self.assertEqual(json.loads(self.target.read_text()), {"engines": {}})
        (self.whisper_dir / "model.bin").write_bytes(b"controlled-test-model-file")
        with patch("speech.recognition.models.runtime_available", return_value=False):
            status = self.configure(self.whisper_manifest)
        by_engine = {entry["engine"]: entry for entry in status["engines"]}
        self.assertFalse(by_engine["faster-whisper"]["available"])
        stored = json.loads(self.target.read_text())
        self.assertEqual(stored["engines"]["faster-whisper"]["directory"], str(self.whisper_dir))
        self.assertEqual(list(self.workspace.glob("*.tmp")), [])

    def test_unconfigure_forgets_only_the_engine_at_that_directory(self):
        with (
            patch("speech.recognition.models.runtime_available", return_value=True),
            patch("speech.recognition.models.qwen3_asr_runtime_available", return_value=True),
        ):
            self.configure(self.whisper_manifest)
            self.configure(self.qwen_manifest)
        unconfigure_speech(self.host, {"params": {"directory": str(self.whisper_dir)}})
        stored = json.loads(self.target.read_text())
        self.assertEqual(set(stored["engines"]), {"qwen3-asr"})
        unconfigure_speech(self.host, {"params": {"directory": str(self.root / "elsewhere")}})
        self.assertEqual(set(json.loads(self.target.read_text())["engines"]), {"qwen3-asr"})
        self.assertEqual(list(self.workspace.glob("*.tmp")), [])


class AdapterDispatchTests(unittest.TestCase):
    def test_the_forced_aligners_own_adapter_refuses_direct_dispatch(self):
        from speech.recognition.adapters import qwen3_forced_aligner
        from speech.recognition.models import get_adapter

        with self.assertRaisesRegex(WorkerError, "MODEL_RUNTIME_MISSING"):
            get_adapter("qwen3-forced-aligner")({})
        with self.assertRaisesRegex(WorkerError, "MODEL_RUNTIME_MISSING"):
            qwen3_forced_aligner.transcribe({})


class SpeechServiceTests(unittest.TestCase):
    def test_timed_segments_use_source_clock_and_preserve_unicode(self):
        segments = [
            SimpleNamespace(start=0.1, end=0.8, text="  Xin chào thế giới  "),
            SimpleNamespace(start=0.9, end=1.3, text="你好"),
        ]
        cues, words = timed_segments(segments, 5000, 7000, lambda _: None)
        self.assertEqual(
            cues[0],
            {"id": "stt-1", "start_ms": 5100, "end_ms": 5800, "text": "Xin chào thế giới"},
        )
        self.assertEqual(cues[1]["text"], "你好")
        self.assertEqual(words, [])

    def test_empty_speech_is_a_valid_empty_result(self):
        self.assertEqual(timed_segments([], 0, 1000, lambda _: None), ([], []))
        self.assertEqual(
            timed_segments([SimpleNamespace(start=0, end=1, text="  ")], 0, 1000, lambda _: None),
            ([], []),
        )

    def test_segment_validation_rejects_invalid_or_overlapping_timing(self):
        cases = [
            SimpleNamespace(start=float("nan"), end=1, text="bad"),
            SimpleNamespace(start=-1, end=1, text="bad"),
            SimpleNamespace(start=0, end=20, text="bad"),
            SimpleNamespace(start=1, end=0.5, text="bad"),
            SimpleNamespace(start=0, end=1, text="bad\x00"),
        ]
        for segment in cases:
            with self.assertRaises(WorkerError):
                timed_segments([segment], 0, 2000, lambda _: None)
        with self.assertRaises(WorkerError):
            timed_segments(
                [
                    SimpleNamespace(start=0, end=1, text="a"),
                    SimpleNamespace(start=0.5, end=1.5, text="b"),
                ],
                0,
                2000,
                lambda _: None,
            )

    def test_word_timings_are_ordered_and_bounded_within_their_cue(self):
        segment = SimpleNamespace(
            start=0.0,
            end=2.0,
            text="Xin chào",
            words=[
                {"text": "Xin", "start": 0.1, "end": 0.4},
                {"text": "chào", "start": 0.5, "end": 0.9},
            ],
        )
        cues, words = timed_segments([segment], 5000, 7000, lambda _: None)
        self.assertEqual(
            words,
            [
                {"cue_id": "stt-1", "start_ms": 5100, "end_ms": 5400, "text": "Xin"},
                {"cue_id": "stt-1", "start_ms": 5500, "end_ms": 5900, "text": "chào"},
            ],
        )
        self.assertEqual(cues[0]["id"], "stt-1")

    def test_a_segment_with_no_words_attribute_produces_no_word_timings(self):
        # faster-whisper segments never carry `.words`; behaviour is unchanged.
        cues, words = timed_segments(
            [SimpleNamespace(start=0, end=1, text="hello")], 0, 2000, lambda _: None
        )
        self.assertEqual(len(cues), 1)
        self.assertEqual(words, [])

    def test_word_timing_validation_rejects_out_of_order_or_out_of_bounds_words(self):
        cases = [
            [{"text": "a", "start": -0.1, "end": 0.2}],
            [
                {"text": "a", "start": 0.5, "end": 0.9},
                {"text": "b", "start": 0.4, "end": 0.6},
            ],
            [{"text": "a", "start": 0.5, "end": 0.5}],
            [{"text": "", "start": 0.1, "end": 0.2}],
            [{"text": "a", "start": float("nan"), "end": 0.2}],
        ]
        for words in cases:
            segment = SimpleNamespace(start=0.0, end=1.0, text="a", words=words)
            with self.assertRaises(WorkerError):
                timed_segments([segment], 0, 2000, lambda _: None)

    def test_word_timings_fail_fast_on_size_before_the_outer_result_limit(self):
        words = [{"text": "w" * 900, "start": i * 1.0, "end": i * 1.0 + 0.5} for i in range(2000)]
        segment = SimpleNamespace(start=0.0, end=2000.0, text="a", words=words)
        with self.assertRaisesRegex(WorkerError, "SPEECH_RESULT_TOO_LARGE"):
            timed_segments([segment], 0, 3600000, lambda _: None)

    def test_request_bounds_and_unknown_fields(self):
        params = {
            "asset_id": "source",
            "source_sha256": "a" * 64,
            "model_id": "b" * 64,
            "language": "vi",
            "start_ms": 0,
            "end_ms": 1000,
        }
        self.assertEqual(parse_options(params), params)
        for changes in (
            {"language": "auto"},
            {"start_ms": True},
            {"end_ms": 7200001},
            {"source_sha256": "bad"},
            {"path": "/unowned"},
        ):
            with self.assertRaises(WorkerError):
                parse_options({**params, **changes})


class CueSegmentationTests(unittest.TestCase):
    def test_an_engine_that_provides_its_own_segments_is_never_re_segmented(self):
        segment = SimpleNamespace(
            start=0.0,
            end=3.0,
            text=" A B ",
            words=[
                {"text": "A", "start": 0.1, "end": 0.6},
                {"text": "B", "start": 2.4, "end": 2.9},
            ],
        )
        cues, words = timed_segments(
            [segment], 0, 3000, lambda _: None, language="en", engine_segments=True
        )
        self.assertEqual(cues, [{"id": "stt-1", "start_ms": 0, "end_ms": 3000, "text": "A B"}])
        self.assertEqual(len(words), 2)

    def test_english_unsegmented_engine_derives_ordered_cues_that_rebuild_the_transcript(self):
        segment = self.segment(
            " Hello there general Kenobi ",
            [
                ("Hello", 0.1, 0.5),
                ("there", 0.5, 0.9),
                ("general", 0.9, 1.3),
                ("Kenobi", 2.1, 2.5),
            ],
        )
        cues, words = timed_segments(
            [segment], 0, 3000, lambda _: None, language="en", engine_segments=False
        )
        self.assertEqual(
            cues,
            [
                {"id": "stt-1", "start_ms": 0, "end_ms": 1300, "text": "Hello there general "},
                {"id": "stt-2", "start_ms": 2100, "end_ms": 3000, "text": "Kenobi"},
            ],
        )
        self.assertEqual("".join(cue["text"] for cue in cues), "Hello there general Kenobi")
        self.assertEqual(
            words,
            [
                {"cue_id": "stt-1", "start_ms": 100, "end_ms": 500, "text": "Hello"},
                {"cue_id": "stt-1", "start_ms": 500, "end_ms": 900, "text": "there"},
                {"cue_id": "stt-1", "start_ms": 900, "end_ms": 1300, "text": "general"},
                {"cue_id": "stt-2", "start_ms": 2100, "end_ms": 2500, "text": "Kenobi"},
            ],
        )
        self.assert_ordered_within_range(cues, words, 0, 3000)

    def test_chinese_derives_without_whitespace_and_rebuilds_the_transcript(self):
        first, second = "我们今天天气很热", "所以出去玩"
        words = [
            (text, 0.1 + index * 0.20, 0.15 + index * 0.20) for index, text in enumerate(first)
        ]
        words += [
            (text, 2.6 + index * 0.20, 2.65 + index * 0.20) for index, text in enumerate(second)
        ]
        segment = self.segment(first + second, words, end=4.0)
        cues, words_out = timed_segments(
            [segment], 0, 4000, lambda _: None, language="zh", engine_segments=False
        )
        self.assertEqual(
            cues,
            [
                {"id": "stt-1", "start_ms": 0, "end_ms": 1550, "text": first},
                {"id": "stt-2", "start_ms": 2600, "end_ms": 4000, "text": second},
            ],
        )
        self.assertEqual("".join(cue["text"] for cue in cues), segment.text)
        self.assertEqual(
            [word["cue_id"] for word in words_out], ["stt-1"] * len(first) + ["stt-2"] * len(second)
        )

    def test_vietnamese_syllables_are_kept_whole_at_an_aligner_word_boundary(self):
        segment = self.segment(
            "Việt Nam học sinh",
            [
                ("Việt", 0.1, 0.6),
                ("Nam", 0.6, 1.1),
                ("học", 1.9, 2.4),
                ("sinh", 2.4, 2.9),
            ],
        )
        cues, words = timed_segments(
            [segment], 0, 3000, lambda _: None, language="vi", engine_segments=False
        )
        self.assertEqual(
            cues,
            [
                {"id": "stt-1", "start_ms": 0, "end_ms": 1100, "text": "Việt Nam "},
                {"id": "stt-2", "start_ms": 1900, "end_ms": 3000, "text": "học sinh"},
            ],
        )
        self.assertEqual("".join(cue["text"] for cue in cues), "Việt Nam học sinh")

    def test_unsegmented_engine_without_an_aligner_still_returns_one_valid_cue(self):
        cues, words = timed_segments(
            [SimpleNamespace(start=0.0, end=2.0, text=" Xin chào Việt Nam ")],
            5000,
            7000,
            lambda _: None,
            language="vi",
            engine_segments=False,
        )
        self.assertEqual(
            cues, [{"id": "stt-1", "start_ms": 5000, "end_ms": 7000, "text": "Xin chào Việt Nam"}]
        )
        self.assertEqual(words, [])

    def test_unmappable_word_texts_fall_back_to_the_single_engine_cue(self):
        segment = self.segment(
            "Hello world",
            [
                ("hello", 0.1, 0.5),
                ("world", 0.6, 1.0),
            ],
            end=1.0,
        )
        cues, words = timed_segments(
            [segment], 0, 2000, lambda _: None, language="en", engine_segments=False
        )
        self.assertEqual(
            cues, [{"id": "stt-1", "start_ms": 0, "end_ms": 1000, "text": "Hello world"}]
        )
        self.assertEqual([word["text"] for word in words], ["hello", "world"])

    def test_derived_cues_stay_within_the_character_budget(self):
        words = [(f"word{index:04d}", index * 0.4, index * 0.4 + 0.4) for index in range(20)]
        transcript = " " + " ".join(text for text, _, _ in words) + " "
        cues, _ = timed_segments(
            [self.segment(transcript, words, end=9.0)],
            0,
            9000,
            lambda _: None,
            language="en",
            engine_segments=False,
        )
        self.assertGreater(len(cues), 1)
        self.assertEqual("".join(cue["text"] for cue in cues), transcript.strip())
        for cue in cues:
            self.assertLessEqual(len(cue["text"].rstrip()), 42 * 2)

    def test_adjacent_limit_break_never_overlaps_the_next_cue(self):
        words = [(f"w{index:02d}", index * 0.09, index * 0.09 + 0.09) for index in range(24)]
        transcript = " " + " ".join(text for text, _, _ in words) + " "
        cues, _ = timed_segments(
            [self.segment(transcript, words, end=2.5)],
            0,
            2500,
            lambda _: None,
            language="en",
            engine_segments=False,
        )
        self.assertGreater(len(cues), 1)
        previous = 0
        for cue in cues:
            self.assertGreater(cue["end_ms"], cue["start_ms"])
            self.assertGreaterEqual(cue["start_ms"], previous)
            previous = cue["end_ms"]
        self.assertEqual("".join(cue["text"] for cue in cues), transcript.strip())

    def segment(self, text, words, end=3.0):
        return SimpleNamespace(
            start=0.0,
            end=end,
            text=text,
            words=[{"text": item, "start": start, "end": stop} for item, start, stop in words],
        )

    def assert_ordered_within_range(self, cues, words, start_ms, end_ms):
        previous = start_ms
        for cue in cues:
            self.assertGreaterEqual(cue["start_ms"], previous)
            self.assertLess(cue["end_ms"], end_ms + 1)
            previous = cue["end_ms"]
        bounds = {cue["id"]: (cue["start_ms"], cue["end_ms"]) for cue in cues}
        previous = {}
        for word in words:
            low = previous.get(word["cue_id"], bounds[word["cue_id"]][0])
            self.assertGreaterEqual(word["start_ms"], low)
            self.assertLessEqual(word["end_ms"], bounds[word["cue_id"]][1])
            previous[word["cue_id"]] = word["end_ms"]


if __name__ == "__main__":
    unittest.main()
