"""Real worker protocol, FFmpeg audio and inference child lifecycle.

The SDK and weight files in this suite are CONTROLLED TEST DOUBLES, not an
installed recognizer. These checks cannot establish real recognition accuracy.
"""

import array
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import wave
from pathlib import Path
from types import SimpleNamespace

from test_worker import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from runtime.process import ProcessRunner
from speech.recognition.service import decode_audio

SDK = """from types import SimpleNamespace
import os, time, socket
from pathlib import Path
class WhisperModel:
    def __init__(self, directory, **kwargs):
        assert Path(directory).is_dir()
        assert kwargs == dict(device='cpu', compute_type='int8', cpu_threads=2,
                              num_workers=1, local_files_only=True)
        assert os.environ.get('HF_HUB_OFFLINE') == '1'
        self.model = SimpleNamespace(is_multilingual=os.environ.get('CONTROLLED_SPEECH_EN_ONLY') != '1')
    def transcribe(self, audio, **kwargs):
        assert kwargs == dict(language='vi', task='transcribe', beam_size=5, temperature=0,
                             condition_on_previous_text=False, word_timestamps=False, vad_filter=False)
        if os.environ.get('CONTROLLED_SPEECH_NETWORK') == '1':
            socket.getaddrinfo('example.invalid', 443)
        def segments():
            if os.environ.get('CONTROLLED_SPEECH_EMPTY') == '1': return
            yield SimpleNamespace(start=0.1, end=0.3, text=' Xin chào Việt Nam ')
            if os.environ.get('CONTROLLED_SPEECH_SLOW') == '1':
                Path(os.environ['CONTROLLED_SPEECH_PID']).write_text(str(os.getpid()))
                time.sleep(30)
            yield SimpleNamespace(start=0.5, end=0.9, text='Nội dung thử nghiệm')
        return segments(), SimpleNamespace(language='vi')
"""


@unittest.skipUnless(
    shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg and ffprobe required"
)
class SpeechNativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="speech-native-")
        cls.root = Path(cls.temp.name)
        cls.source = cls.root / "nguồn ' tiếng nói.mkv"
        cls.silent = cls.root / "silent.mkv"
        # PCM avoids codec delay ambiguity; the first audio packet is one second late.
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=s=160x90:r=24:d=3",
                "-itsoffset",
                "1",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:duration=2",
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
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(cls.source),
                "-map",
                "0:v:0",
                "-c",
                "copy",
                "-an",
                "-n",
                str(cls.silent),
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
        for name in ("model.bin", "config.json", "tokenizer.json", "vocabulary.json"):
            data = b"CONTROLLED TEST ARTIFACT, NOT RECOGNITION WEIGHTS"
            (self.model / name).write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
        self.manifest = self.case / "manifest.json"
        self.manifest.write_text(
            json.dumps(
                {
                    "engine": "faster-whisper",
                    "directory": str(self.model),
                    "languages": ["vi"],
                    "files": files,
                }
            )
        )
        self.sdk = self.case / "controlled-sdk"
        self.sdk.mkdir()
        (self.sdk / "faster_whisper.py").write_text(SDK, encoding="utf-8")
        for name in ("ctranslate2", "tokenizers", "numpy", "av"):
            (self.sdk / f"{name}.py").write_text("")
        for name in ("faster_whisper", "ctranslate2"):
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

    def session(self, **environment):
        session = Session(self.workspace, env={**self.env, **environment})
        self.sessions.append(session)
        status = session.call("speech.configure", {"path": str(self.manifest)})
        entry = next(e for e in status["engines"] if e["engine"] == "faster-whisper")
        self.assertTrue(entry["available"])
        self.assertFalse(entry["verified"])
        asset = session.call("asset.register", {"path": str(self.source), "kind": "video"})
        params = {
            "asset_id": asset["asset_id"],
            "source_sha256": asset["sha256"],
            "model_id": entry["model_id"],
            "language": "vi",
            "start_ms": 1000,
            "end_ms": 2000,
        }
        return session, params

    def test_real_audio_preserves_delayed_start_and_exact_sample_clock(self):
        host = SimpleNamespace(ffmpeg=shutil.which("ffmpeg"), process=ProcessRunner(lambda _: None))
        full, sample = self.case / "full.wav", self.case / "sample.wav"
        decode_audio(host, {"id": "audio-full"}, self.source, 0, 3000, full)
        decode_audio(host, {"id": "audio-sample"}, self.source, 1500, 2500, sample)
        with wave.open(str(full)) as audio:
            data = array.array("h", audio.readframes(audio.getnframes()))
        with wave.open(str(sample)) as audio:
            cut = array.array("h", audio.readframes(audio.getnframes()))

        def rms(values):
            return math.sqrt(sum(value * value for value in values) / len(values))

        self.assertEqual(len(data), 48000)
        self.assertEqual(len(cut), 16000)
        self.assertLess(rms(data[:12000]), 1)
        self.assertGreater(rms(data[20000:28000]), 1000)
        self.assertEqual(cut, data[24000:40000])

    def test_controlled_recognition_returns_correlated_source_clock_unicode_and_provenance(self):
        session, params = self.session()
        result = session.call("speech.transcribe", params, revision=17)
        self.assertEqual(
            result["cues"][0],
            {"id": "stt-1", "start_ms": 1100, "end_ms": 1300, "text": "Xin chào Việt Nam"},
        )
        # faster-whisper segments its own output, so it is never re-segmented:
        # the two cues stay exactly what the engine produced, at the engine's
        # own boundaries, rather than being merged into one whole-range cue.
        self.assertEqual(
            result["cues"],
            [
                {"id": "stt-1", "start_ms": 1100, "end_ms": 1300, "text": "Xin chào Việt Nam"},
                {"id": "stt-2", "start_ms": 1500, "end_ms": 1900, "text": "Nội dung thử nghiệm"},
            ],
        )
        self.assertEqual(result["source_sha256"], self.original)
        self.assertEqual(result["model_id"], params["model_id"])
        self.assertEqual(
            (result["clock"], result["timing"], result["language"]), ("source", "segment", "vi")
        )
        self.assertEqual(result["runtime"], "faster-whisper@0.0.0;ctranslate2@0.0.0")
        # No forced aligner exists for this engine: the transcript stays valid
        # and carries no word timings, ticket 07's explicit no-op guarantee.
        self.assertEqual(result["words"], [])
        self.assertIsNone(result["aligner_model_id"])
        terminals = [
            event for event in session.events if event.get("data", {}).get("kind") == "stt"
        ]
        self.assertEqual(len(terminals), 1)
        self.assertEqual(terminals[0]["revision"], 17)
        self.assertTrue(session.call("media.probe", {"asset_id": params["asset_id"]})["has_audio"])

    def test_empty_result_is_not_fabricated_speech(self):
        session, params = self.session(CONTROLLED_SPEECH_EMPTY="1")
        self.assertEqual(session.call("speech.transcribe", params)["cues"], [])

    def test_cancel_reaps_real_child_cleans_audio_and_unblocks_shared_queue(self):
        session, params = self.session(CONTROLLED_SPEECH_SLOW="1")
        request = session.send("speech.transcribe", params)
        queued_probe = session.send("media.probe", {"asset_id": params["asset_id"]})
        while True:
            message = session.messages.get(timeout=20)
            session.events.append(message)
            if message["id"] == queued_probe and message["event"] != "progress":
                self.fail("Probe bypassed the active recognition queue item")
            if message["id"] == request and message["event"] == "error":
                self.fail(str(message))
            if (
                message["id"] == request
                and message["event"] == "progress"
                and message["data"].get("fraction")
            ):
                break
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

    def test_changed_hash_fails_before_inference_and_worker_survives(self):
        session, params = self.session()
        (self.model / "model.bin").write_bytes(b"changed")
        with self.assertRaisesRegex(RuntimeError, "MODEL_HASH_MISMATCH"):
            session.call("speech.transcribe", params)
        self.assertTrue(session.call("hello", {})["ffmpeg"])
        with self.assertRaisesRegex(RuntimeError, "SPEECH_MODEL_CHANGED"):
            session.call("speech.transcribe", {**params, "model_id": "a" * 64})

    def test_language_fallback_is_refused_and_no_audio_is_explicit(self):
        session, params = self.session(CONTROLLED_SPEECH_EN_ONLY="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_LANGUAGE_UNAVAILABLE"):
            session.call("speech.transcribe", params)
        asset = session.call("asset.register", {"path": str(self.silent), "kind": "video"})
        with self.assertRaisesRegex(RuntimeError, "NO_AUDIO"):
            session.call(
                "speech.transcribe",
                {**params, "asset_id": asset["asset_id"], "source_sha256": asset["sha256"]},
            )

    def test_inference_child_python_network_is_denied(self):
        session, params = self.session(CONTROLLED_SPEECH_NETWORK="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_NETWORK_DISABLED"):
            session.call("speech.transcribe", params)
        self.assertTrue(session.call("hello", {})["ffmpeg"])


if __name__ == "__main__":
    unittest.main()
