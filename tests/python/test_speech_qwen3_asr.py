"""Real worker protocol, FFmpeg audio and inference child lifecycle for Qwen3-ASR.

Mirrors tests/python/test_speech_native.py, which exercises the same seam
through faster-whisper. The SDK and weight files here are CONTROLLED TEST
DOUBLES, not an installed recognizer: this suite establishes call-shape and
plumbing behaviour, never real recognition accuracy.
"""

import hashlib
import json
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from test_worker import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))

# Qwen3-ASR's own transcribe() returns exactly one (language, text) pair per
# input audio with no internal timing; timestamps need the separate forced
# aligner (a later ticket). The double mirrors that: one SimpleNamespace with
# a `.language`/`.text` pair, not a `.start`/`.end` segment generator like the
# faster-whisper double.
SDK = """import os, socket, time
from pathlib import Path
from types import SimpleNamespace
import torch

class Qwen3ASRModel:
    @classmethod
    def from_pretrained(cls, directory, **kwargs):
        assert Path(directory).is_dir()
        assert kwargs == dict(device_map='cpu', dtype=torch.float32, local_files_only=True,
                               max_inference_batch_size=1, max_new_tokens=1024)
        assert os.environ.get('HF_HUB_OFFLINE') == '1'
        return cls()

    def transcribe(self, audio, language=None, return_time_stamps=False):
        assert Path(audio).is_file()
        assert return_time_stamps is False
        assert language == 'Vietnamese'
        if os.environ.get('CONTROLLED_SPEECH_NETWORK') == '1':
            socket.getaddrinfo('example.invalid', 443)
        if os.environ.get('CONTROLLED_SPEECH_EMPTY') == '1':
            return [SimpleNamespace(language=language, text='')]
        if os.environ.get('CONTROLLED_SPEECH_SLOW') == '1':
            Path(os.environ['CONTROLLED_SPEECH_PID']).write_text(str(os.getpid()))
            time.sleep(30)
        return [SimpleNamespace(language=language, text=' Xin chào Việt Nam ')]
"""

TORCH_SDK = "float32 = 'CONTROLLED_FLOAT32_SENTINEL'\n"


@unittest.skipUnless(
    shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg and ffprobe required"
)
class SpeechQwen3ASRTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="speech-qwen3-asr-")
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

    def setUp(self):
        self.case = Path(tempfile.mkdtemp(dir=self.root))
        self.workspace = self.case / "workspace"
        self.workspace.mkdir()
        self.model = self.case / "model"
        self.model.mkdir()
        files = {}
        for name in (
            "config.json",
            "tokenizer_config.json",
            "vocab.json",
            "merges.txt",
            "model.safetensors",
        ):
            data = b"CONTROLLED TEST ARTIFACT, NOT RECOGNITION WEIGHTS " + name.encode()
            (self.model / name).write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
        self.manifest = self.case / "manifest.json"
        self.manifest.write_text(
            json.dumps(
                {
                    "engine": "qwen3-asr",
                    "directory": str(self.model),
                    "languages": ["vi"],
                    "files": files,
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
        self.env = {
            **os.environ,
            "PYTHONPATH": str(self.sdk),
            "CONTROLLED_SPEECH_PID": str(self.case / "child.pid"),
        }
        self.sessions = []

    def tearDown(self):
        for session in self.sessions:
            session.close()
        self.assertFalse(list(self.workspace.glob("speech-*")))
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.original)

    def session(self, *, require_available=True, **environment):
        session = Session(self.workspace, env={**self.env, **environment})
        self.sessions.append(session)
        status = session.call("speech.configure", {"path": str(self.manifest)})
        entry = next(e for e in status["engines"] if e["engine"] == "qwen3-asr")
        if require_available:
            self.assertTrue(entry["available"])
        asset = session.call("asset.register", {"path": str(self.source), "kind": "video"})
        params = {
            "asset_id": asset["asset_id"],
            "source_sha256": asset["sha256"],
            "model_id": entry["model_id"],
            "language": "vi",
            "start_ms": 0,
            "end_ms": 3000,
        }
        return session, params

    def test_controlled_recognition_returns_one_whole_range_cue_and_distinct_runtime(self):
        session, params = self.session()
        result = session.call("speech.transcribe", params, revision=9)
        self.assertEqual(
            result["cues"],
            [{"id": "stt-1", "start_ms": 0, "end_ms": 3000, "text": "Xin chào Việt Nam"}],
        )
        self.assertEqual(result["source_sha256"], self.original)
        self.assertEqual(result["model_id"], params["model_id"])
        self.assertEqual(
            (result["clock"], result["timing"], result["language"]), ("source", "segment", "vi")
        )
        self.assertEqual(result["runtime"], "qwen-asr@0.0.0;torch@0.0.0")
        # No aligner is configured in this suite: the transcript stays valid
        # and carries no word timings (ticket 07's explicit no-op guarantee).
        self.assertEqual(result["words"], [])
        self.assertIsNone(result["aligner_model_id"])
        terminals = [
            event for event in session.events if event.get("data", {}).get("kind") == "stt"
        ]
        self.assertEqual(len(terminals), 1)
        self.assertEqual(terminals[0]["revision"], 9)

    def test_empty_result_is_not_fabricated_speech(self):
        session, params = self.session(CONTROLLED_SPEECH_EMPTY="1")
        self.assertEqual(session.call("speech.transcribe", params)["cues"], [])

    def test_cancel_reaps_real_child_cleans_audio_and_unblocks_shared_queue(self):
        # Unlike faster-whisper's segment-by-segment generator, Qwen3-ASR's real
        # transcribe() returns one blocking call with no partial results to drive
        # progress.json; the pid file our double writes just before its blocking
        # sleep is the only signal that the child is genuinely busy inside it.
        session, params = self.session(CONTROLLED_SPEECH_SLOW="1")
        pid_file = self.case / "child.pid"
        request = session.send("speech.transcribe", params)
        queued_probe = session.send("media.probe", {"asset_id": params["asset_id"]})
        deadline = time.monotonic() + 20
        while not pid_file.exists():
            if time.monotonic() > deadline:
                self.fail("Controlled child never reached its blocking inference call")
            try:
                message = session.messages.get(timeout=0.2)
            except queue.Empty:
                continue
            session.events.append(message)
            if message["id"] == queued_probe and message["event"] != "progress":
                self.fail("Probe bypassed the active recognition queue item")
            if message["id"] == request and message["event"] == "error":
                self.fail(str(message))
        started = time.monotonic()
        self.assertTrue(session.call("cancel", {"request_id": request})["requested"])
        self.assertEqual(session.wait(request)["data"]["code"], "CANCELLED")
        self.assertLess(time.monotonic() - started, 5)
        self.assertEqual(session.wait(queued_probe)["event"], "result")
        self.assertFalse(list(self.workspace.glob("speech-*")))
        if os.name != "nt":
            pid = int((self.case / "child.pid").read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    def test_changed_hash_fails_before_and_after_inference_and_worker_survives(self):
        session, params = self.session()
        (self.model / "model.safetensors").write_bytes(b"changed")
        with self.assertRaisesRegex(RuntimeError, "MODEL_HASH_MISMATCH"):
            session.call("speech.transcribe", params)
        self.assertTrue(session.call("hello", {})["ffmpeg"])
        with self.assertRaisesRegex(RuntimeError, "SPEECH_MODEL_CHANGED"):
            session.call("speech.transcribe", {**params, "model_id": "a" * 64})

    def test_language_not_in_configured_bundle_is_refused_before_inference(self):
        session, params = self.session()
        # The manifest only configured "vi"; "en" must be refused by the shared
        # registry seam before the Qwen3-ASR child is ever launched.
        with self.assertRaisesRegex(RuntimeError, "MODEL_LANGUAGE_UNAVAILABLE"):
            session.call("speech.transcribe", {**params, "language": "en"})

    def test_missing_runtime_package_surfaces_as_runtime_missing_not_a_crash(self):
        # A fresh process whose path never had `qwen_asr` on it (as if
        # requirements-speech.txt's optional install was never run for this
        # engine), not a mid-session deletion racing import-cache staleness.
        bare_sdk = self.case / "bare-sdk"
        bare_sdk.mkdir()
        (bare_sdk / "torch.py").write_text(TORCH_SDK, encoding="utf-8")
        for name in ("transformers", "librosa", "soundfile"):
            (bare_sdk / f"{name}.py").write_text("")
        session, params = self.session(require_available=False, PYTHONPATH=str(bare_sdk))
        with self.assertRaisesRegex(RuntimeError, "MODEL_RUNTIME_MISSING"):
            session.call("speech.transcribe", params)
        self.assertTrue(session.call("hello", {})["ffmpeg"])

    def test_inference_child_python_network_is_denied(self):
        session, params = self.session(CONTROLLED_SPEECH_NETWORK="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_NETWORK_DISABLED"):
            session.call("speech.transcribe", params)
        self.assertTrue(session.call("hello", {})["ffmpeg"])


if __name__ == "__main__":
    unittest.main()
