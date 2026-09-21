"""Static-scan parity between worker/runtime/errors.py's KNOWN_CODES and every WorkerError(...)
call site under worker/. KNOWN_CODES is hand-authored (these codes have no schema home, and this
repo has no Python type checker to enforce a Literal), so this test is what keeps it honest.
"""

from __future__ import annotations

import ast
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker"))

CODE_RE = re.compile(r"^[A-Z][A-Z_]*$")


def raised_codes() -> set[str]:
    codes: set[str] = set()
    for path in (ROOT / "worker").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "WorkerError"
                and node.args
                and isinstance(node.args[0], ast.Constant)
                and isinstance(node.args[0].value, str)
                and CODE_RE.match(node.args[0].value)
            ):
                codes.add(node.args[0].value)
    return codes


class TestWorkerErrorCodesParity(unittest.TestCase):
    def test_every_raised_code_is_known(self):
        from runtime.errors import KNOWN_CODES

        raised = raised_codes()
        self.assertEqual(
            raised - KNOWN_CODES,
            set(),
            "WorkerError(...) raises a code missing from KNOWN_CODES",
        )

    def test_every_known_code_is_either_raised_or_the_documented_fallback(self):
        from runtime.errors import KNOWN_CODES

        raised = raised_codes()
        undocumented_unused = KNOWN_CODES - raised - {"WORKER_FAILURE"}
        self.assertEqual(
            undocumented_unused,
            set(),
            "KNOWN_CODES has an entry no WorkerError(...) call site raises",
        )


if __name__ == "__main__":
    unittest.main()
