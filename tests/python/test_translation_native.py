"""Real worker/subprocess tests using CONTROLLED SDK doubles."""

import hashlib
import json
import os
import tempfile
import time
import unittest
from pathlib import Path

from test_worker import Session

CT2 = """from types import SimpleNamespace
import os, socket, time
from pathlib import Path
class Translator:
    def __init__(self, directory, **kwargs):
        assert Path(directory).is_dir()
        assert kwargs == dict(device='cpu', compute_type='int8', inter_threads=1, intra_threads=2, max_queued_batches=1)
        assert os.environ['HF_HUB_OFFLINE'] == '1'
        self.directory = Path(directory)
    def translate_batch(self, tokens, **kwargs):
        assert kwargs == dict(beam_size=4, num_hypotheses=1, max_batch_size=8, max_input_length=0,
                             max_decoding_length=512, return_end_token=True, end_token='</s>', replace_unknowns=False)
        if os.environ.get('CONTROLLED_TRANSLATION_NETWORK'):
            socket.getaddrinfo('example.invalid', 443)
        if os.environ.get('CONTROLLED_TRANSLATION_SLOW'):
            Path(os.environ['CONTROLLED_TRANSLATION_PID']).write_text(str(os.getpid()))
            time.sleep(30)
        if os.environ.get('CONTROLLED_TRANSLATION_HASH'):
            (self.directory / 'model.bin').write_bytes(b'changed during inference')
        if os.environ.get('CONTROLLED_TRANSLATION_COUNT'): return []
        ending = [] if os.environ.get('CONTROLLED_TRANSLATION_TRUNCATED') else ['</s>']
        return [SimpleNamespace(hypotheses=[['Xin', 'chào', 'Việt', 'Nam'] + ending]) for value in tokens]
"""
SPM = """import os
from pathlib import Path
class SentencePieceProcessor:
    def __init__(self, model_file):
        self.name = Path(model_file).name
        assert self.name in ('source.spm', 'target.spm')
    def encode(self, text, out_type):
        assert self.name == 'source.spm' and out_type is str
        return ['x'] * 513 if os.environ.get('CONTROLLED_TRANSLATION_LONG') else text.split()
    def decode(self, tokens):
        assert self.name == 'target.spm'
        return ' '.join(tokens)
"""


class TranslationNativeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="translation-native-")
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.model = self.root / "mô hình"
        self.model.mkdir()
        files = {}
        for name in (
            "model.bin",
            "config.json",
            "source.spm",
            "target.spm",
            "shared_vocabulary.json",
        ):
            data = b"CONTROLLED TEST FILE; NOT REAL TRANSLATION WEIGHTS"
            (self.model / name).write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
        self.manifest = self.root / "manifest.json"
        self.manifest.write_text(
            json.dumps(
                {
                    "engine": "ctranslate2-sentencepiece",
                    "directory": str(self.model),
                    "source_language": "en",
                    "target_language": "vi",
                    "files": files,
                }
            )
        )
        self.sdk = self.root / "controlled-sdk"
        self.sdk.mkdir()
        for name, code in [("ctranslate2", CT2), ("sentencepiece", SPM)]:
            (self.sdk / f"{name}.py").write_text(code, encoding="utf-8")
            metadata = self.sdk / f"{name}-0.0.0.dist-info"
            metadata.mkdir()
            (metadata / "METADATA").write_text(
                f"Metadata-Version: 2.1\nName: {name}\nVersion: 0.0.0\n"
            )
        self.source = self.root / "original.srt"
        self.source.write_text("1\n00:00:00,000 --> 00:00:01,000\nOriginal source\n")
        self.original = self.source.read_bytes()
        self.sessions = []

    def tearDown(self):
        for session in self.sessions:
            session.close()
        self.assertFalse(list(self.workspace.glob("translation-*")))
        self.assertEqual(self.source.read_bytes(), self.original)
        self.temp.cleanup()

    def session(self, **environment):
        env = {
            **os.environ,
            "PYTHONPATH": str(self.sdk),
            "CONTROLLED_TRANSLATION_PID": str(self.root / "child.pid"),
            **environment,
        }
        session = Session(self.workspace, env=env)
        self.sessions.append(session)
        status = session.call("translation.configure", {"path": str(self.manifest)})
        self.assertTrue(status["available"])
        self.assertFalse(status["verified"])
        params = {
            "source_layer": "transcript",
            "source_token": "source-12345678",
            "source_language": "en",
            "target_language": "vi",
            "model_id": status["model_id"],
            "rules": [{"find": "Xin", "replace": "Kính"}],
            "cues": [{"id": "segment-1", "start_ms": 1250, "end_ms": 2500, "text": "Hello world"}],
        }
        return session, params

    def test_real_worker_child_keeps_ids_times_languages_rules_and_runtime(self):
        session, params = self.session()
        result = session.call("speech.translate", params, revision=19)
        self.assertEqual(result["cues"], [{**params["cues"][0], "text": "Kính chào Việt Nam"}])
        for key in (
            "source_token",
            "model_id",
            "rules",
            "source_layer",
            "source_language",
            "target_language",
        ):
            self.assertEqual(result[key], params[key])
        self.assertEqual(result["runtime"], "ctranslate2@0.0.0;sentencepiece@0.0.0")
        terminals = [e for e in session.events if e.get("data", {}).get("kind") == "translation"]
        self.assertEqual(len(terminals), 1)
        self.assertEqual(terminals[0]["revision"], 19)
        self.assertTrue(session.call("translation.status", {})["available"])
        self.assertFalse(list((self.workspace / "renders").iterdir()))

    def test_cancel_reaps_child_and_releases_same_worker_queue(self):
        session, params = self.session(CONTROLLED_TRANSLATION_SLOW="1")
        request = session.send("speech.translate", params)
        queued = session.send("asset.register", {"path": str(self.source), "kind": "subtitle"})
        deadline = time.monotonic() + 10
        while not (self.root / "child.pid").exists() and time.monotonic() < deadline:
            time.sleep(0.025)
        self.assertTrue((self.root / "child.pid").exists(), "inference child did not start")
        self.assertTrue(session.call("cancel", {"request_id": request})["requested"])
        self.assertEqual(session.wait(request)["data"]["code"], "CANCELLED")
        self.assertEqual(session.wait(queued)["event"], "result")
        self.assertFalse(list(self.workspace.glob("translation-*")))
        if os.name != "nt":
            with self.assertRaises(ProcessLookupError):
                os.kill(int((self.root / "child.pid").read_text()), 0)

    def test_network_attempt_is_refused_without_fallback(self):
        session, params = self.session(CONTROLLED_TRANSLATION_NETWORK="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_NETWORK_DISABLED"):
            session.call("speech.translate", params)
        self.assertEqual(session.call("hello", {})["protocol"], 1)

    def test_token_limit_does_not_silently_truncate_input(self):
        session, params = self.session(CONTROLLED_TRANSLATION_LONG="1")
        with self.assertRaisesRegex(RuntimeError, "TRANSLATION_TOKEN_LIMIT"):
            session.call("speech.translate", params)

    def test_incomplete_hypothesis_is_not_published(self):
        session, params = self.session(CONTROLLED_TRANSLATION_TRUNCATED="1")
        with self.assertRaisesRegex(RuntimeError, "TRANSLATION_TRUNCATED"):
            session.call("speech.translate", params)

    def test_missing_segments_fail_atomically(self):
        session, params = self.session(CONTROLLED_TRANSLATION_COUNT="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_OUTPUT_INVALID"):
            session.call("speech.translate", params)

    def test_model_modified_during_inference_is_rejected(self):
        session, params = self.session(CONTROLLED_TRANSLATION_HASH="1")
        with self.assertRaisesRegex(RuntimeError, "MODEL_HASH_MISMATCH"):
            session.call("speech.translate", params)

    def test_changed_configuration_or_language_pair_requires_new_request(self):
        session, params = self.session()
        with self.assertRaisesRegex(RuntimeError, "TRANSLATION_MODEL_CHANGED"):
            session.call("speech.translate", {**params, "model_id": "b" * 64})
        with self.assertRaisesRegex(RuntimeError, "MODEL_LANGUAGE_UNAVAILABLE"):
            session.call("speech.translate", {**params, "source_language": "zh"})
