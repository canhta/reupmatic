"""Real worker protocol, FFmpeg audio and inference child lifecycle for word-level
timestamps from a configured Qwen3-ForcedAligner bundle (ticket 07).

Mirrors tests/python/test_speech_qwen3_asr.py, which exercises the base engine
through the same seam. The SDK and weight files here are CONTROLLED TEST
DOUBLES, not installed weights: this suite establishes call-shape, contract and
plumbing behaviour, never real alignment quality.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_worker import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))

# The forced aligner is only ever reached through `Qwen3ASRModel.from_pretrained
# (forced_aligner=..., forced_aligner_kwargs=...)` plus `transcribe(...,
# return_time_stamps=True)` (see qwen_asr/inference/qwen3_asr.py, reviewed
# This double models exactly that shape: one `Qwen3ASRModel` whose
# `.transcribe()` returns per-word `time_stamps` (an iterable of objects with
# `.text`/`.start_time`/`.end_time`, seconds relative to the whole input audio)
# only when a forced aligner directory was actually supplied at load time.
SDK = """import os, socket
from pathlib import Path
from types import SimpleNamespace


class _TimeStamps:
    def __init__(self, items):
        self.items = items

    def __iter__(self):
        return iter(self.items)


class Qwen3ASRModel:
    @classmethod
    def from_pretrained(cls, directory, **kwargs):
        assert Path(directory).is_dir()
        assert os.environ.get('HF_HUB_OFFLINE') == '1'
        self = cls()
        self.forced_aligner = kwargs.pop('forced_aligner', None)
        self.forced_aligner_kwargs = kwargs.pop('forced_aligner_kwargs', None)
        assert kwargs == dict(device_map='cpu', dtype='CONTROLLED_FLOAT32_SENTINEL',
                               local_files_only=True, max_inference_batch_size=1,
                               max_new_tokens=1024)
        if self.forced_aligner is not None:
            assert Path(self.forced_aligner).is_dir()
            assert self.forced_aligner_kwargs == dict(
                device_map='cpu', dtype='CONTROLLED_FLOAT32_SENTINEL', local_files_only=True
            )
        return self

    def transcribe(self, audio, language=None, return_time_stamps=False):
        assert Path(audio).is_file()
        assert language == 'Vietnamese'
        assert return_time_stamps is (self.forced_aligner is not None)
        if os.environ.get('CONTROLLED_SPEECH_NETWORK') == '1':
            socket.getaddrinfo('example.invalid', 443)
        time_stamps = None
        if return_time_stamps:
            time_stamps = _TimeStamps([
                SimpleNamespace(text='Xin', start_time=0.0, end_time=0.4),
                SimpleNamespace(text='chào', start_time=0.5, end_time=0.9),
                SimpleNamespace(text='Việt', start_time=2.0, end_time=2.3),
                SimpleNamespace(text='Nam', start_time=2.4, end_time=2.7),
            ])
        return [SimpleNamespace(language=language, text=' Xin chào Việt Nam ', time_stamps=time_stamps)]
"""

TORCH_SDK = "float32 = 'CONTROLLED_FLOAT32_SENTINEL'\n"


@unittest.skipUnless(
    shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg and ffprobe required"
)
class SpeechForcedAlignerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="speech-forced-aligner-")
        cls.root = Path(cls.temp.name)
        cls.source = cls.root / "nguồn tiếng nói.mkv"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=s=160x90:r=24:d=3",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=3",
                "-c:v",
                "libx264",
                "-threads",
                "2",
                "-c:a",
                "pcm_s16le",
                "-n",
                str(cls.source),
            ],
            check=True,
        )
        cls.original = hashlib.sha256(cls.source.read_bytes()).hexdigest()

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def _bundle(self, directory, names):
        directory.mkdir()
        files = {}
        for name in names:
            data = (
                b"CONTROLLED TEST ARTIFACT, NOT REAL WEIGHTS "
                + directory.name.encode()
                + name.encode()
            )
            (directory / name).write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
        return files

    def setUp(self):
        self.case = Path(tempfile.mkdtemp(dir=self.root))
        self.workspace = self.case / "workspace"
        self.workspace.mkdir()

        bundle_files = ("config.json", "tokenizer_config.json", "vocab.json", "merges.txt")
        self.asr_dir = self.case / "asr-model"
        self.asr_files = self._bundle(self.asr_dir, (*bundle_files, "model.safetensors"))
        self.asr_manifest = self.case / "asr-manifest.json"
        self.asr_manifest.write_text(
            json.dumps(
                {
                    "engine": "qwen3-asr",
                    "directory": str(self.asr_dir),
                    "languages": ["vi"],
                    "files": self.asr_files,
                }
            )
        )

        self.aligner_dir = self.case / "aligner-model"
        self.aligner_files = self._bundle(self.aligner_dir, (*bundle_files, "model.safetensors"))
        self.aligner_manifest = self.case / "aligner-manifest.json"
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

        self.sdk = self.case / "controlled-sdk"
        self.sdk.mkdir()
        (self.sdk / "qwen_asr.py").write_text(SDK, encoding="utf-8")
        (self.sdk / "torch.py").write_text(TORCH_SDK, encoding="utf-8")
        for name in ("transformers", "librosa", "soundfile"):
            (self.sdk / f"{name}.py").write_text("")
        for name in ("qwen_asr", "torch"):
            metadata = self.sdk / f"{name}-0.0.0.dist-info"
            metadata.mkdir()
            (metadata / "METADATA").write_text(
                f"Metadata-Version: 2.1\nName: {name.replace('_', '-')}\nVersion: 0.0.0\n"
            )
        self.env = {**os.environ, "PYTHONPATH": str(self.sdk)}
        self.sessions = []

    def tearDown(self):
        for session in self.sessions:
            session.close()
        self.assertFalse(list(self.workspace.glob("speech-*")))
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.original)

    def session(self, **environment):
        session = Session(self.workspace, env={**self.env, **environment})
        self.sessions.append(session)
        return session

    def register(self, session):
        return session.call("asset.register", {"path": str(self.source), "kind": "video"})

    def test_recognizing_with_a_configured_aligner_derives_cues_that_rebuild_the_transcript(self):
        session = self.session()
        session.call("speech.configure", {"path": str(self.asr_manifest)})
        status = session.call("speech.configure", {"path": str(self.aligner_manifest)})
        by_engine = {e["engine"]: e for e in status["engines"]}
        self.assertTrue(by_engine["qwen3-asr"]["available"])
        self.assertTrue(by_engine["qwen3-forced-aligner"]["available"])
        asset = self.register(session)
        params = {
            "asset_id": asset["asset_id"],
            "source_sha256": asset["sha256"],
            "model_id": by_engine["qwen3-asr"]["model_id"],
            "language": "vi",
            "start_ms": 0,
            "end_ms": 3000,
        }
        result = session.call("speech.transcribe", params)
        # Qwen3-ASR returns no segments of its own, so the silence gap between
        # "chào" and "Việt" produces two cues. The engine's whole-range cue was
        # 0..3000; the derived first cue is extended to the published minimum.
        self.assertEqual(
            result["cues"],
            [
                {"id": "stt-1", "start_ms": 0, "end_ms": 900, "text": "Xin chào "},
                {"id": "stt-2", "start_ms": 2000, "end_ms": 3000, "text": "Việt Nam"},
            ],
        )
        # The words themselves are never rewritten, dropped or merged: joining
        # the derived cue text rebuilds the engine's own transcript.
        self.assertEqual("".join(cue["text"] for cue in result["cues"]), "Xin chào Việt Nam")
        self.assertEqual(
            result["words"],
            [
                {"cue_id": "stt-1", "start_ms": 0, "end_ms": 400, "text": "Xin"},
                {"cue_id": "stt-1", "start_ms": 500, "end_ms": 900, "text": "chào"},
                {"cue_id": "stt-2", "start_ms": 2000, "end_ms": 2300, "text": "Việt"},
                {"cue_id": "stt-2", "start_ms": 2400, "end_ms": 2700, "text": "Nam"},
            ],
        )
        self.assertEqual(result["aligner_model_id"], by_engine["qwen3-forced-aligner"]["model_id"])
        # Cues are ordered, non-overlapping and within the requested range; each
        # word sits inside the cue its boundaries now belong to.
        previous = 0
        bounds = {cue["id"]: (cue["start_ms"], cue["end_ms"]) for cue in result["cues"]}
        word_previous: dict[str, int] = {}
        for word in result["words"]:
            low = word_previous.get(word["cue_id"], bounds[word["cue_id"]][0])
            self.assertGreaterEqual(word["start_ms"], low)
            self.assertLessEqual(word["end_ms"], bounds[word["cue_id"]][1])
            word_previous[word["cue_id"]] = word["end_ms"]
        for cue in result["cues"]:
            self.assertGreaterEqual(cue["start_ms"], previous)
            self.assertLessEqual(cue["end_ms"], params["end_ms"])
            previous = cue["end_ms"]

    def test_recognizing_without_a_configured_aligner_carries_no_word_timings(self):
        session = self.session()
        status = session.call("speech.configure", {"path": str(self.asr_manifest)})
        model_id = next(e for e in status["engines"] if e["engine"] == "qwen3-asr")["model_id"]
        asset = self.register(session)
        params = {
            "asset_id": asset["asset_id"],
            "source_sha256": asset["sha256"],
            "model_id": model_id,
            "language": "vi",
            "start_ms": 0,
            "end_ms": 3000,
        }
        result = session.call("speech.transcribe", params)
        self.assertEqual(result["words"], [])
        self.assertIsNone(result["aligner_model_id"])
        self.assertEqual(len(result["cues"]), 1)

    def test_a_tampered_aligner_bundle_fails_the_recognition_that_would_use_it(self):
        session = self.session()
        session.call("speech.configure", {"path": str(self.asr_manifest)})
        status = session.call("speech.configure", {"path": str(self.aligner_manifest)})
        model_id = next(e for e in status["engines"] if e["engine"] == "qwen3-asr")["model_id"]
        (self.aligner_dir / "model.safetensors").write_bytes(b"tampered")
        asset = self.register(session)
        params = {
            "asset_id": asset["asset_id"],
            "source_sha256": asset["sha256"],
            "model_id": model_id,
            "language": "vi",
            "start_ms": 0,
            "end_ms": 3000,
        }
        with self.assertRaisesRegex(RuntimeError, "MODEL_HASH_MISMATCH"):
            session.call("speech.transcribe", params)
        self.assertTrue(session.call("hello", {})["ffmpeg"])

    def test_requesting_the_aligners_own_model_id_directly_is_refused(self):
        session = self.session()
        status = session.call("speech.configure", {"path": str(self.aligner_manifest)})
        model_id = next(e for e in status["engines"] if e["engine"] == "qwen3-forced-aligner")[
            "model_id"
        ]
        asset = self.register(session)
        params = {
            "asset_id": asset["asset_id"],
            "source_sha256": asset["sha256"],
            "model_id": model_id,
            "language": "vi",
            "start_ms": 0,
            "end_ms": 3000,
        }
        with self.assertRaisesRegex(RuntimeError, "MODEL_RUNTIME_MISSING"):
            session.call("speech.transcribe", params)
        self.assertTrue(session.call("hello", {})["ffmpeg"])


if __name__ == "__main__":
    unittest.main()
