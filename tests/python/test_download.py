"""media.download against a local HTTP server that serves a real, playable media file.

Covers the ticket-06 media half only: streaming to disk, resume, size verification, partial
cleanup on failure and cancellation, destination reuse, and the FFmpeg probe that turns an HTTP
200 into an actual completion fact. No Electron orchestration is exercised here.
"""

from __future__ import annotations

import hashlib
import json
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SLOW_PADDING = 8 * 1024 * 1024


class Session:
    def __init__(self, workspace, env=None):
        child_env = {**os.environ, **env} if env else None
        self.proc = subprocess.Popen(
            [sys.executable, "-u", str(ROOT / "worker/main.py"), "--workspace", str(workspace)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            env=child_env,
        )
        self.messages = queue.Queue()
        self.replies = {}
        self.events = []
        self.diagnostics = []

        def read():
            for line in self.proc.stdout:
                self.messages.put(json.loads(line))

        def read_diagnostics():
            for line in self.proc.stderr:
                try:
                    self.diagnostics.append(json.loads(line))
                except ValueError:
                    pass

        self.reader = threading.Thread(target=read, daemon=True)
        self.reader.start()
        self.diagnostic_reader = threading.Thread(target=read_diagnostics, daemon=True)
        self.diagnostic_reader.start()

    def diagnostic(self, event, timeout=5):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            for record in list(self.diagnostics):
                if record.get("event") == event:
                    return record
            time.sleep(0.02)
        raise AssertionError(f"no {event} diagnostic record")

    def send(self, method, params, revision=0):
        rid = str(uuid.uuid4())
        self.proc.stdin.write(
            json.dumps(
                {"v": 1, "id": rid, "revision": revision, "method": method, "params": params},
                ensure_ascii=False,
            )
            + "\n"
        )
        self.proc.stdin.flush()
        return rid

    def wait(self, rid):
        if rid in self.replies:
            return self.replies.pop(rid)
        while True:
            msg = self.messages.get(timeout=40)
            self.events.append(msg)
            if msg["event"] != "progress":
                if msg["id"] == rid:
                    return msg
                self.replies[msg["id"]] = msg

    def call(self, method, params, revision=0):
        msg = self.wait(self.send(method, params, revision))
        if msg["event"] == "error":
            raise RuntimeError(msg["data"]["code"])
        return msg["data"]

    def close(self):
        self.proc.stdin.close()
        try:
            self.proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
        self.reader.join(timeout=2)
        self.diagnostic_reader.join(timeout=2)
        self.proc.stdout.close()
        self.proc.stderr.close()


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def do_GET(self):
        self.close_connection = True
        self.server.hits.append(self.path)
        if self.path.startswith("/missing"):
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        payload = self.server.payload
        if self.path.startswith("/slow"):
            payload = payload + b"\x00" * SLOW_PADDING
        start = 0
        value = self.headers.get("Range", "")
        if value.startswith("bytes="):
            try:
                start = int(value[len("bytes=") :].split("-")[0])
            except ValueError:
                start = 0
        if start >= len(payload):
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{len(payload)}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        body = payload[start:]
        status = 206 if start > 0 else 200
        self.send_response(status)
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{len(payload) - 1}/{len(payload)}")
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            if self.path.startswith("/stall"):
                # Headers land, then nothing else: the client's read() blocks until its own
                # (short, test-configured) socket timeout fires. Bounded so the handler thread
                # cannot outlive the test itself even if the release event is never set.
                self.server.stall_started.set()
                self.server.stall_release.wait(timeout=10)
            elif self.path.startswith("/slow"):
                for index in range(0, len(body), 256 * 1024):
                    self.wfile.write(body[index : index + 256 * 1024])
                    self.wfile.flush()
                    time.sleep(0.15)
            elif self.path.startswith("/truncated"):
                self.wfile.write(body[: len(body) // 2])
                self.wfile.flush()
            else:
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, payload):
        super().__init__(address, _Handler)
        self.payload = payload
        self.hits = []
        self.stall_started = threading.Event()
        self.stall_release = threading.Event()


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/ffprobe required")
class DownloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="reupmatic-download-")
        cls.root = Path(cls.temp.name)
        source = cls.root / "source.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=320x180:rate=24:duration=2",
                "-c:v",
                "libx264",
                "-threads",
                "1",
                "-pix_fmt",
                "yuv420p",
                "-n",
                str(source),
            ],
            check=True,
        )
        cls.payload = source.read_bytes()
        cls.digest = hashlib.sha256(cls.payload).hexdigest()
        cls.server = _Server(("127.0.0.1", 0), cls.payload)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.temp.cleanup()

    def setUp(self):
        self.work = Path(tempfile.mkdtemp(dir=self.root))
        self.s = Session(self.work / "workspace")

    def tearDown(self):
        self.s.close()

    def destination(self, name="out.mp4"):
        return self.work / name

    def part_of(self, destination):
        return destination.with_name(destination.name + ".part")

    def test_download_lands_a_playable_probed_file(self):
        destination = self.destination()
        result = self.s.call(
            "media.download",
            {
                "url": f"{self.base}/media.mp4",
                "destination": str(destination),
                "expected_size": len(self.payload),
                "cookies": [{"name": "sessionid", "value": "abc123"}],
                "referer": "https://www.douyin.com/",
            },
            revision=3,
        )
        self.assertFalse(result["reused"])
        self.assertFalse(result["resumed"])
        self.assertEqual(result["path"], str(destination))
        self.assertEqual(result["bytes"], len(self.payload))
        self.assertEqual(result["sha256"], self.digest)
        self.assertTrue(destination.is_file())
        self.assertFalse(self.part_of(destination).exists())
        self.assertEqual(result["width"], 320)
        self.assertEqual(result["height"], 180)
        self.assertAlmostEqual(result["duration_ms"], 2000, delta=60)
        self.assertTrue(result["container"])
        self.assertTrue(result["codec"])
        self.assertRegex(result["frame_rate"], r"^\d+(/\d+)?$")
        self.assertFalse(result["has_audio"])
        results = [m for m in self.s.events if m["event"] == "result"]
        self.assertTrue(all(m["revision"] == 3 for m in results))

    def test_resumed_download_is_byte_identical_to_a_single_pass(self):
        single = self.destination("single.mp4")
        self.s.call(
            "media.download",
            {"url": f"{self.base}/media.mp4", "destination": str(single)},
        )
        resumed = self.destination("resumed.mp4")
        part = self.part_of(resumed)
        part.write_bytes(self.payload[:1234])
        result = self.s.call(
            "media.download",
            {
                "url": f"{self.base}/media.mp4",
                "destination": str(resumed),
                "expected_size": len(self.payload),
                "resume": True,
            },
        )
        self.assertTrue(result["resumed"])
        self.assertEqual(result["sha256"], self.digest)
        self.assertFalse(part.exists())
        self.assertEqual(resumed.read_bytes(), self.payload)
        self.assertEqual(resumed.read_bytes(), single.read_bytes())

    def test_size_mismatch_deletes_the_partial(self):
        destination = self.destination("mismatch.mp4")
        with self.assertRaisesRegex(RuntimeError, "DOWNLOAD_SIZE_MISMATCH"):
            self.s.call(
                "media.download",
                {
                    "url": f"{self.base}/media.mp4",
                    "destination": str(destination),
                    "expected_size": len(self.payload) + 1,
                },
            )
        self.assertFalse(destination.exists())
        self.assertFalse(self.part_of(destination).exists())

    def test_cancel_mid_download_leaves_no_partial(self):
        destination = self.destination("cancelled.mp4")
        request_id = self.s.send(
            "media.download",
            {"url": f"{self.base}/slow.mp4", "destination": str(destination)},
        )
        time.sleep(0.4)
        reply = self.s.call("cancel", {"request_id": request_id})
        self.assertTrue(reply["requested"])
        message = self.s.wait(request_id)
        self.assertEqual(message["event"], "error")
        self.assertEqual(message["data"]["code"], "CANCELLED")
        self.assertFalse(destination.exists())
        self.assertFalse(self.part_of(destination).exists())

    def test_completed_destination_is_reused_without_refetching(self):
        destination = self.destination("reuse.mp4")
        first = self.s.call(
            "media.download",
            {"url": f"{self.base}/media.mp4", "destination": str(destination)},
        )
        hits = self.server.hits.count("/media.mp4")
        second = self.s.call(
            "media.download",
            {"url": f"{self.base}/media.mp4", "destination": str(destination)},
        )
        self.assertFalse(first["reused"])
        self.assertTrue(second["reused"])
        self.assertEqual(second["sha256"], first["sha256"])
        self.assertEqual(second["bytes"], first["bytes"])
        self.assertEqual(self.server.hits.count("/media.mp4"), hits)

    def test_missing_url_fails_without_leaving_a_file(self):
        destination = self.destination("missing.mp4")
        with self.assertRaisesRegex(RuntimeError, "DOWNLOAD_FAILED"):
            self.s.call(
                "media.download",
                {"url": f"{self.base}/missing", "destination": str(destination)},
            )
        self.assertFalse(destination.exists())
        self.assertFalse(self.part_of(destination).exists())

    def test_a_refused_transfer_records_status_host_and_phase(self):
        destination = self.destination("refused.mp4")
        with self.assertRaisesRegex(RuntimeError, "DOWNLOAD_FAILED"):
            self.s.call(
                "media.download",
                {"url": f"{self.base}/missing?sig=secret", "destination": str(destination)},
            )
        record = self.s.diagnostic("media.download-failed")
        self.assertEqual(record["level"], "warn")
        self.assertEqual(record["code"], "DOWNLOAD_FAILED")
        detail = record["detail"]
        self.assertEqual(detail["phase"], "connect")
        self.assertEqual(detail["http_status"], 404)
        self.assertEqual(detail["host"], "127.0.0.1")
        self.assertNotIn("secret", json.dumps(record))

    def test_a_completed_transfer_records_bytes_and_host(self):
        destination = self.destination("recorded.mp4")
        result = self.s.call(
            "media.download", {"url": f"{self.base}/media.mp4", "destination": str(destination)}
        )
        detail = self.s.diagnostic("media.download-done")["detail"]
        self.assertEqual(detail["bytes"], result["bytes"])
        self.assertEqual(detail["http_status"], 200)
        self.assertEqual(detail["host"], "127.0.0.1")
        self.assertIsInstance(detail["elapsed_ms"], int)

    def test_truncated_body_fails_without_leaving_a_file(self):
        destination = self.destination("truncated.mp4")
        message = self.s.wait(
            self.s.send(
                "media.download",
                {"url": f"{self.base}/truncated", "destination": str(destination)},
            )
        )
        self.assertEqual(message["event"], "error")
        self.assertIn(message["data"]["code"], {"DOWNLOAD_FAILED", "DOWNLOAD_SIZE_MISMATCH"})
        self.assertFalse(destination.exists())
        self.assertFalse(self.part_of(destination).exists())

    def test_a_stalled_read_fails_as_stalled_not_a_generic_refusal(self):
        # A worker with a short read timeout so the test does not wait out a real 60s stall.
        stalled = Session(self.work / "stalled-workspace", env={"REUPMATIC_DOWNLOAD_TIMEOUT": "1"})
        self.server.stall_started.clear()
        self.server.stall_release.clear()
        try:
            destination = self.destination("stalled.mp4")
            with self.assertRaisesRegex(RuntimeError, "DOWNLOAD_STALLED"):
                stalled.call(
                    "media.download",
                    {"url": f"{self.base}/stall", "destination": str(destination)},
                )
            self.assertTrue(
                self.server.stall_started.wait(timeout=5), "the server never saw the request"
            )
            self.assertFalse(destination.exists())
            self.assertFalse(self.part_of(destination).exists())
            record = stalled.diagnostic("media.download-failed")
            self.assertEqual(record["code"], "DOWNLOAD_STALLED")
            self.assertEqual(record["detail"]["phase"], "read")
        finally:
            self.server.stall_release.set()
            stalled.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
