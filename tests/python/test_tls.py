"""The worker's HTTPS trust must not depend on how the interpreter was installed.

A python.org macOS framework ships an empty OpenSSL CA directory until its "Install
Certificates" script is run, and every HTTPS request then fails verification with "self-signed
certificate in certificate chain" — which is what broke Douyin downloads (live).
"""

from __future__ import annotations

import shutil
import ssl
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker"))

from runtime import tls  # noqa: E402


def _ca_count(context: ssl.SSLContext) -> int:
    return context.cert_store_stats()["x509_ca"]


@unittest.skipUnless(shutil.which("openssl"), "openssl CLI required to mint a test CA")
class TlsContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="reupmatic-tls-")
        cls.bundle = Path(cls.temp.name) / "bundle.pem"
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=Reupmatic Test CA",
                "-addext",
                "basicConstraints=critical,CA:TRUE",
                "-keyout",
                str(Path(cls.temp.name) / "key.pem"),
                "-out",
                str(cls.bundle),
            ],
            check=True,
            capture_output=True,
        )

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_an_empty_interpreter_store_falls_back_to_a_system_bundle(self):
        empty = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context = tls.build_context(
            lambda: empty, candidates=(Path("/nonexistent.pem"), self.bundle)
        )
        self.assertEqual(_ca_count(context), 1)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)

    def test_a_populated_interpreter_store_is_used_as_is(self):
        populated = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        populated.load_verify_locations(cafile=str(self.bundle))
        context = tls.build_context(lambda: populated, candidates=())
        self.assertIs(context, populated)

    def test_no_bundle_anywhere_still_verifies_rather_than_trusting_everything(self):
        empty = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context = tls.build_context(lambda: empty, candidates=(Path("/nonexistent.pem"),))
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertEqual(_ca_count(context), 0)


if __name__ == "__main__":
    unittest.main()
