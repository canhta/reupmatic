"""Audit hook cannot be removed once installed, so always run it in a separate subprocess."""

from __future__ import annotations

import subprocess
import sys
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "worker"

# localhost vs 127.0.0.1 proves the hook denies by configured hostname string, not resolved IP.
_SCRIPT = """
import sys
sys.path.insert(0, {worker!r})
from runtime.hosted_egress import deny_network_except_host
sys.addaudithook(deny_network_except_host({allowed_host!r}))
import http.client
import subprocess as sp


def attempt(host, port):
    try:
        conn = http.client.HTTPConnection(host, port, timeout=3)
        conn.request("GET", "/")
        conn.getresponse()
        return "ok"
    except Exception as error:
        return type(error).__name__ + ":" + str(error)


print("ALLOWED:" + attempt({allowed_host!r}, {allowed_port}))
print("DENIED:" + attempt({denied_host!r}, {denied_port}))
try:
    sp.run([sys.executable, "-c", "pass"])
    print("SUBPROCESS:ok")
except Exception as error:
    print("SUBPROCESS:" + type(error).__name__ + ":" + str(error))
"""


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, *_args):
        pass


class HostedEgressTests(unittest.TestCase):
    def test_socket_permitted_only_to_the_configured_host_subprocess_still_denied(self):
        allowed = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        Thread(target=allowed.serve_forever, daemon=True).start()
        try:
            script = _SCRIPT.format(
                worker=str(WORKER),
                allowed_host="127.0.0.1",
                allowed_port=allowed.server_port,
                denied_host="localhost",
                denied_port=allowed.server_port,
            )
            result = subprocess.run(
                [sys.executable, "-c", script],
                capture_output=True,
                text=True,
                timeout=15,
            )
            output = result.stdout + result.stderr
            self.assertIn("ALLOWED:ok", output, output)
            self.assertIn("DENIED:WorkerError:MODEL_NETWORK_DISABLED", output, output)
            self.assertIn("SUBPROCESS:WorkerError:MODEL_NETWORK_DISABLED", output, output)
        finally:
            allowed.shutdown()
            allowed.server_close()


if __name__ == "__main__":
    unittest.main()
