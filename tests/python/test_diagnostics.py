"""The worker's Diagnostic records, driven through the existing session harness.

A refused request, a failing job and a failing native tool must each leave a valid record on
stderr, carrying the worker's own error code so the Diagnostic log and the UI agree on what
happened. stdout stays the request/response protocol and carries no diagnostics.
"""

from __future__ import annotations

import contextlib
import io
import json
import queue
import sys
import tempfile
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_worker import Session  # noqa: E402


class DiagnosticSession(Session):
    """`Session` plus a stderr reader, so the records the worker writes can be asserted."""

    def __init__(self, workspace, env=None):
        super().__init__(workspace, env)
        self.records = queue.Queue()
        self.malformed: list[str] = []

        def read_errors():
            for line in self.proc.stderr:
                if not line.strip():
                    continue
                try:
                    self.records.put(json.loads(line))
                except ValueError:
                    self.malformed.append(line)

        self.error_reader = threading.Thread(target=read_errors, daemon=True)
        self.error_reader.start()

    def await_record(self, event, timeout=40):
        while True:
            record = self.records.get(timeout=timeout)
            if record.get("event") == event:
                return record


def emitted(work) -> list[dict]:
    """Runs `work` with stderr captured and returns the Diagnostic records it wrote."""
    buffer = io.StringIO()
    with contextlib.redirect_stderr(buffer):
        work()
    return [json.loads(line) for line in buffer.getvalue().splitlines() if line.strip()]


class WorkerDiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="reupmatic-diagnostics-")
        self.session = DiagnosticSession(Path(self.temp.name))

    def tearDown(self):
        self.session.close()
        self.temp.cleanup()

    def test_a_refused_request_leaves_a_record_carrying_its_code(self):
        with self.assertRaises(RuntimeError):
            self.session.call("media.nonexistent", {})
        record = self.session.await_record("worker.request-refused")
        self.assertEqual(record["source"], {"process": "worker", "module": "runtime"})
        self.assertEqual(record["level"], "warn")
        self.assertEqual(record["code"], "METHOD_UNAVAILABLE")
        self.assertEqual(record["detail"]["method"], "media.nonexistent")
        self.assertEqual(self.session.malformed, [])

    def test_a_failing_job_leaves_a_record_correlated_to_its_job(self):
        missing = Path(self.temp.name) / "absent.mp4"
        request_id = self.session.send("media.probe", {"path": str(missing)})
        reply = self.session.wait(request_id)
        self.assertEqual(reply["event"], "error")
        record = self.session.await_record("worker.job-failed")
        self.assertEqual(record["code"], reply["data"]["code"])
        self.assertEqual(record["correlation"], {"job": request_id})
        self.assertEqual(record["detail"]["method"], "media.probe")
        self.assertEqual(record["level"], "error")

    def test_a_failing_native_tool_folds_its_own_stderr_into_the_record(self):
        from runtime.errors import WorkerError
        from runtime.process import ProcessRunner

        runner = ProcessRunner(lambda req: None)
        script = (
            "import sys; sys.stderr.write('banner\\nreal reason: bad argument\\n'); sys.exit(3)"
        )
        raised: list[WorkerError] = []

        def run_failing_tool():
            try:
                runner.run({"id": "job-tool-1", "revision": 0}, [sys.executable, "-c", script])
            except WorkerError as exc:
                raised.append(exc)

        records = emitted(run_failing_tool)
        self.assertEqual([exc.code for exc in raised], ["TOOL_FAILED"])
        folded = [record for record in records if record["event"] == "worker.tool-failed"]
        self.assertEqual(len(folded), 1)
        self.assertEqual(folded[0]["code"], "TOOL_FAILED")
        self.assertEqual(folded[0]["source"]["module"], "runtime/process")
        self.assertEqual(folded[0]["correlation"], {"job": "job-tool-1"})
        self.assertEqual(folded[0]["detail"]["exit_code"], 3)
        self.assertIn("real reason: bad argument", folded[0]["detail"]["stderr_tail"])

    def test_a_record_is_one_json_object_per_line_with_a_flat_detail(self):
        from runtime import diagnostics

        records = emitted(
            lambda: diagnostics.emit(
                "sources.probe",
                module="sources",
                level="info",
                job="job-1",
                detail={"count": 3, "ok": True, "note": None, "nested": {"a": 1}},
            )
        )
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["detail"]["count"], 3)
        self.assertIs(records[0]["detail"]["ok"], True)
        self.assertIsNone(records[0]["detail"]["note"])
        # A nested value is flattened to a string rather than making the record invalid.
        self.assertIsInstance(records[0]["detail"]["nested"], str)
        self.assertEqual(set(records[0]) - set(diagnostics.FIELDS), set())


if __name__ == "__main__":
    unittest.main()
