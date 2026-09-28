"""Local TLS stub stands in for DashScope; the credential must never reach the job file."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import ssl
import subprocess
import tempfile
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from test_worker import Session

ROOT = Path(__file__).resolve().parents[2]
CREDENTIAL = "top-secret-hosted-value"


class _StubHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        self.server.received.append(
            {"authorization": self.headers.get("Authorization"), "body": body}
        )
        model = body.get("model")
        if model == "controlled-reject":
            payload = b'{"code":"InvalidApiKey","message":"rejected"}'
            self.send_response(401)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if model == "controlled-slow":
            time.sleep(self.server.slow_seconds)
        if model == "controlled-nested":
            value = {"output": {"output": {"sentence": {"text": "Nội dung lồng nhau"}}}}
        else:
            value = {"output": {"text": "Xin chào từ DashScope"}}
        payload = json.dumps(value).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        pass


@unittest.skipUnless(
    shutil.which("ffmpeg") and shutil.which("ffprobe") and shutil.which("openssl"),
    "FFmpeg and openssl required",
)
class SpeechHostedNativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="speech-hosted-native-")
        cls.root = Path(cls.temp.name)
        cls.source = cls.root / "clip.mkv"
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
                "sine=frequency=523:duration=3",
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
        # Stub is real HTTPS: the adapter always speaks https://, so trust a self-signed cert.
        cls.cert = cls.root / "stub-cert.pem"
        cls.key = cls.root / "stub-key.pem"
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-days",
                "1",
                "-nodes",
                "-keyout",
                str(cls.key),
                "-out",
                str(cls.cert),
                "-subj",
                "/CN=127.0.0.1",
                "-addext",
                "subjectAltName=IP:127.0.0.1",
            ],
            check=True,
            capture_output=True,
        )

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        self.workspace = Path(tempfile.mkdtemp(dir=self.root))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _StubHandler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(str(self.cert), str(self.key))
        self.server.socket = context.wrap_socket(self.server.socket, server_side=True)
        self.server.daemon_threads = True
        self.server.received = []
        self.server.slow_seconds = 0.5
        Thread(target=self.server.serve_forever, daemon=True).start()
        self.sessions = []

    def tearDown(self):
        for session in self.sessions:
            session.close()
        self.server.shutdown()
        self.server.server_close()
        self.assertFalse(list(self.workspace.glob("speech-*")))
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.original)

    def session(self):
        session = Session(self.workspace, env={**os.environ, "SSL_CERT_FILE": str(self.cert)})
        self.sessions.append(session)
        asset = session.call("asset.register", {"path": str(self.source), "kind": "video"})
        return session, asset

    def provider(self, **overrides):
        return {
            "protocol": "dashscope",
            "endpoint_host": f"127.0.0.1:{self.server.server_port}",
            "remote_model_name": "flash",
            "max_duration_ms": 60000,
            **overrides,
        }

    def params(self, session, asset, **overrides):
        return {
            "asset_id": asset["asset_id"],
            "source_sha256": asset["sha256"],
            "model_id": "f" * 64,
            "language": "vi",
            "start_ms": 0,
            "end_ms": 1000,
            "provider": self.provider(),
            "credential": CREDENTIAL,
            **overrides,
        }

    def test_hosted_transcription_succeeds_and_the_stub_receives_only_the_bearer_credential(self):
        session, asset = self.session()
        result = session.call("speech.transcribe", self.params(session, asset))
        self.assertEqual(len(result["cues"]), 1)
        self.assertEqual(result["cues"][0]["text"], "Xin chào từ DashScope")
        self.assertIn("dashscope", result["runtime"])
        received = self.server.received
        self.assertEqual(len(received), 1)
        self.assertEqual(received[0]["authorization"], f"Bearer {CREDENTIAL}")
        self.assertNotIn(CREDENTIAL, json.dumps(received[0]["body"]))

    def test_a_second_response_shape_is_also_understood_without_a_top_level_text_field(self):
        session, asset = self.session()
        result = session.call(
            "speech.transcribe",
            self.params(
                session, asset, provider=self.provider(remote_model_name="controlled-nested")
            ),
        )
        self.assertEqual(result["cues"][0]["text"], "Nội dung lồng nhau")

    def test_credential_never_reaches_the_on_disk_job_file(self):
        self.server.slow_seconds = 2
        session, asset = self.session()
        rid = session.send(
            "speech.transcribe",
            self.params(
                session, asset, provider=self.provider(remote_model_name="controlled-slow")
            ),
        )
        job_file = None
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            found = list(self.workspace.glob("speech-*/request.json"))
            if found:
                job_file = found[0]
                break
            time.sleep(0.02)
        self.assertIsNotNone(job_file, "the job file never appeared before the child responded")
        on_disk = job_file.read_text(encoding="utf-8")
        self.assertNotIn(CREDENTIAL, on_disk)
        self.assertNotIn("credential", on_disk)
        self.assertIn("provider", on_disk)
        msg = session.wait(rid)
        self.assertEqual(msg["event"], "result")

    def test_a_request_over_its_models_own_duration_bound_is_refused_before_any_audio_moves(self):
        session, asset = self.session()
        with self.assertRaisesRegex(RuntimeError, "SPEECH_CLOUD_LIMIT"):
            session.call(
                "speech.transcribe",
                self.params(
                    session,
                    asset,
                    end_ms=2000,
                    provider=self.provider(max_duration_ms=1000),
                ),
            )
        self.assertFalse(list(self.workspace.glob("speech-*")))
        self.assertEqual(self.server.received, [])
        self.assertTrue(session.call("hello", {})["ffmpeg"])

    def test_a_rejected_credential_maps_to_the_existing_inference_failure_code(self):
        session, asset = self.session()
        with self.assertRaisesRegex(RuntimeError, "MODEL_INFERENCE_FAILED"):
            session.call(
                "speech.transcribe",
                self.params(
                    session, asset, provider=self.provider(remote_model_name="controlled-reject")
                ),
            )

    def test_an_unreachable_endpoint_maps_to_the_existing_network_code(self):
        session, asset = self.session()
        with self.assertRaisesRegex(RuntimeError, "MODEL_NETWORK_DISABLED"):
            session.call(
                "speech.transcribe",
                self.params(session, asset, provider=self.provider(endpoint_host="127.0.0.1:1")),
            )

    def test_cancel_reaps_the_hosted_child_and_frees_the_queue(self):
        self.server.slow_seconds = 30
        session, asset = self.session()
        request = session.send(
            "speech.transcribe",
            self.params(
                session, asset, provider=self.provider(remote_model_name="controlled-slow")
            ),
        )
        while True:
            message = session.messages.get(timeout=20)
            session.events.append(message)
            if message["id"] == request and message["event"] == "error":
                self.fail(str(message))
            if (
                message["id"] == request
                and message["event"] == "progress"
                and message["data"].get("phase") == "speechRecognizing"
            ):
                break
        started = time.monotonic()
        self.assertTrue(session.call("cancel", {"request_id": request})["requested"])
        self.assertEqual(session.wait(request)["data"]["code"], "CANCELLED")
        self.assertLess(time.monotonic() - started, 10)

    def test_missing_credential_and_missing_provider_are_both_a_plain_bad_request(self):
        session, asset = self.session()
        with self.assertRaisesRegex(RuntimeError, "INVALID_REQUEST"):
            session.call(
                "speech.transcribe",
                {**self.params(session, asset), "credential": ""},
            )
        base = self.params(session, asset)
        del base["provider"]
        del base["credential"]
        with self.assertRaisesRegex(RuntimeError, "SPEECH_MODEL_CHANGED"):
            session.call("speech.transcribe", base)


if __name__ == "__main__":
    unittest.main()
