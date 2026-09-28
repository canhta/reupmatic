"""Live dispatch dict cannot be generated; assert it matches QUEUED_METHODS."""

from __future__ import annotations

import ast
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker"))


def dispatch_dict_keys() -> set[str]:
    source = (ROOT / "worker" / "runtime" / "worker.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    loop = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == "_loop"
    )
    # Dispatch table is the dict literal subscripted by req["method"], not event payloads.
    dispatch_literals = [
        node.value
        for node in ast.walk(loop)
        if isinstance(node, ast.Subscript)
        and isinstance(node.value, ast.Dict)
        and all(
            isinstance(key, ast.Constant) and isinstance(key.value, str) for key in node.value.keys
        )
    ]
    if len(dispatch_literals) != 1:
        raise AssertionError(
            f"expected exactly one subscripted dict literal in Worker._loop, found {len(dispatch_literals)}"
        )
    return {key.value for key in dispatch_literals[0].keys}


class TestWorkerOperationsParity(unittest.TestCase):
    def test_dispatch_keys_match_generated_queued_methods(self):
        from runtime.operations import QUEUED_METHODS

        self.assertEqual(dispatch_dict_keys(), set(QUEUED_METHODS))

    def test_instant_and_queued_methods_are_disjoint_and_complete(self):
        from runtime.operations import INSTANT_METHODS, METHODS, QUEUED_METHODS

        self.assertEqual(INSTANT_METHODS | QUEUED_METHODS, METHODS)
        self.assertEqual(INSTANT_METHODS & QUEUED_METHODS, frozenset())

    def test_progress_phases_are_exactly_queued_and_running(self):
        from runtime.operations import PROGRESS_PHASES, PROGRESS_QUEUED, PROGRESS_RUNNING

        self.assertEqual(PROGRESS_PHASES, frozenset({PROGRESS_QUEUED, PROGRESS_RUNNING}))
        self.assertEqual(PROGRESS_QUEUED, "queued")
        self.assertEqual(PROGRESS_RUNNING, "running")


if __name__ == "__main__":
    unittest.main()
