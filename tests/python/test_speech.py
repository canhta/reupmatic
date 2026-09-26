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
        self.assertEqual(names, {"faster-whisper"})
        for entry in status["engines"]:
            self.assertFalse(entry["available"])
            self.assertEqual(entry["code"], "MODEL_MISSING")
            self.assertIsNone(entry["model_id"])
            self.assertEqual(entry["languages"], [])

    def test_reconfiguring_an_engine_updates_only_its_own_model_id(self):
        with patch("speech.recognition.models.runtime_available", return_value=True):
            self.configure(self.whisper_manifest)
        first = SpeechEngines(self.target).status()["engines"][0]["model_id"]
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
        with patch("speech.recognition.models.runtime_available", return_value=True):
            status = self.configure(self.whisper_manifest)
        by_engine = {entry["engine"]: entry for entry in status["engines"]}
        self.assertNotEqual(by_engine["faster-whisper"]["model_id"], first)
        self.assertEqual(set(by_engine), {"faster-whisper"})

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
            self.configure(self.whisper_manifest)

    def test_require_resolves_the_engine_owning_the_requested_model_id_and_refuses_others(self):
        with patch("speech.recognition.models.runtime_available", return_value=True):
            status = self.configure(self.whisper_manifest)
        engines = SpeechEngines(self.target)
        model_id = status["engines"][0]["model_id"]
        with patch("speech.recognition.models.runtime_available", return_value=True):
            bundle = engines.require(model_id, "vi")
        self.assertEqual(bundle["engine"], "faster-whisper")
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
        with patch("speech.recognition.models.runtime_available", return_value=True):
            self.configure(self.whisper_manifest)
        unconfigure_speech(self.host, {"params": {"directory": str(self.root / "elsewhere")}})
        self.assertEqual(set(json.loads(self.target.read_text())["engines"]), {"faster-whisper"})
        unconfigure_speech(self.host, {"params": {"directory": str(self.whisper_dir)}})
        self.assertEqual(set(json.loads(self.target.read_text())["engines"]), set())
        self.assertEqual(list(self.workspace.glob("*.tmp")), [])


class SpeechServiceTests(unittest.TestCase):
    def test_timed_segments_use_source_clock_and_preserve_unicode(self):
        segments = [
            SimpleNamespace(start=0.1, end=0.8, text="  Xin chào thế giới  "),
            SimpleNamespace(start=0.9, end=1.3, text="你好"),
        ]
        cues = timed_segments(segments, 5000, 7000, lambda _: None)
        self.assertEqual(
            cues[0],
            {"id": "stt-1", "start_ms": 5100, "end_ms": 5800, "text": "Xin chào thế giới"},
        )
        self.assertEqual(cues[1]["text"], "你好")

    def test_word_timestamps_split_a_segment_on_the_source_clock(self):
        from speech.recognition.timestamps import MAX_CUE_CHARS, timed_segments

        words = [
            SimpleNamespace(start=index * 0.25, end=(index + 1) * 0.25, word=f" {name}")
            for index, name in enumerate(
                ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
            )
        ]
        segment = SimpleNamespace(
            start=0.0,
            end=2.5,
            text=" one two three four five six seven eight nine ten",
            words=words,
        )
        cues = timed_segments([segment], 5000, 8000, lambda _: None)
        self.assertEqual(
            [cue["text"] for cue in cues],
            ["one two three four five six seven eight", "nine ten"],
        )
        self.assertEqual(
            [(cue["start_ms"], cue["end_ms"]) for cue in cues], [(5000, 7000), (7000, 7500)]
        )
        self.assertTrue(all(len(cue["text"]) <= MAX_CUE_CHARS for cue in cues))
        self.assertEqual([cue["id"] for cue in cues], ["stt-1", "stt-2"])

    def test_word_timestamps_split_a_cue_that_runs_too_long(self):
        from speech.recognition.timestamps import MAX_CUE_MS, timed_segments

        words = [
            SimpleNamespace(start=0.0, end=1.0, word=" one"),
            SimpleNamespace(start=1.0, end=2.0, word=" two"),
            SimpleNamespace(start=2.0, end=3.0, word=" three"),
            SimpleNamespace(start=3.0, end=4.5, word=" four"),
        ]
        segment = SimpleNamespace(start=0.0, end=4.5, text=" one two three four", words=words)
        cues = timed_segments([segment], 0, 5000, lambda _: None)
        self.assertEqual([cue["text"] for cue in cues], ["one two three", "four"])
        self.assertTrue(all(cue["end_ms"] - cue["start_ms"] <= MAX_CUE_MS for cue in cues))

    def test_a_segment_without_words_stays_one_cue(self):
        from speech.recognition.timestamps import timed_segments

        segment = SimpleNamespace(start=0.0, end=4.8, text="Hello and welcome")
        cues = timed_segments([segment], 0, 4800, lambda _: None)
        self.assertEqual([cue["text"] for cue in cues], ["Hello and welcome"])

    def test_overlapping_and_zero_length_words_are_clamped_not_rejected(self):
        from speech.recognition.timestamps import timed_segments

        segment = SimpleNamespace(
            start=0.0,
            end=1.0,
            text=" one two! three",
            words=[
                SimpleNamespace(start=0.0, end=0.4, word=" one"),
                SimpleNamespace(start=0.3, end=0.4, word=" two"),  # overlaps the previous word
                SimpleNamespace(start=0.4, end=0.4, word="!"),  # zero length
                SimpleNamespace(start=0.5, end=0.9, word=" three"),
                SimpleNamespace(start=1.0, end=1.0, word=" tail"),  # no room left
            ],
        )
        cues = timed_segments([segment], 0, 1000, lambda _: None)
        self.assertEqual([cue["text"] for cue in cues], ["one two! three"])
        for cue in cues:
            self.assertLess(cue["start_ms"], cue["end_ms"])
            self.assertGreaterEqual(cue["start_ms"], 0)
            self.assertLessEqual(cue["end_ms"], 1000)

    def test_numpy_float_timings_from_the_adapter_are_accepted(self):
        from speech.recognition.timestamps import timed_segments

        class NumpyFloat(float):
            pass

        segment = SimpleNamespace(
            start=NumpyFloat(0.0),
            end=NumpyFloat(0.8),
            text=" xin chào",
            words=[
                SimpleNamespace(start=NumpyFloat(0.0), end=NumpyFloat(0.4), word=" xin"),
                SimpleNamespace(start=NumpyFloat(0.4), end=NumpyFloat(0.8), word=" chào"),
            ],
        )
        cues = timed_segments([segment], 0, 1000, lambda _: None)
        self.assertEqual([cue["text"] for cue in cues], ["xin chào"])

    def test_invalid_word_timing_is_rejected(self):
        from speech.recognition.timestamps import timed_segments

        segment = SimpleNamespace(
            start=0.0,
            end=1.0,
            text=" hi",
            words=[SimpleNamespace(start=0.5, end=0.4, word=" hi")],
        )
        with self.assertRaises(WorkerError):
            timed_segments([segment], 0, 1000, lambda _: None)

    def test_empty_speech_is_a_valid_empty_result(self):
        self.assertEqual(timed_segments([], 0, 1000, lambda _: None), [])
        self.assertEqual(
            timed_segments([SimpleNamespace(start=0, end=1, text="  ")], 0, 1000, lambda _: None),
            [],
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


if __name__ == "__main__":
    unittest.main()
