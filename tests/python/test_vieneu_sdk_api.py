"""Drift guard: the controlled SDK double mirrors the installed VieNeu engine's clone API."""

from __future__ import annotations

import importlib.util
import inspect
import unittest

import synthesis_fixture

HAS_VIENEU = importlib.util.find_spec("vieneu") is not None


def _parameters(function) -> list:
    return [
        (parameter.name, parameter.kind, parameter.default)
        for parameter in inspect.signature(function).parameters.values()
        if parameter.name != "self"
    ]


@unittest.skipUnless(HAS_VIENEU, "vieneu SDK is not installed")
class VieneuSdkApiTests(unittest.TestCase):
    def engine(self):
        from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine

        return OnnxV3LiteEngine

    def test_the_engine_clone_api_is_prepare_reference_and_not_encode_reference(self):
        engine = self.engine()
        self.assertTrue(hasattr(engine, "prepare_reference"))
        self.assertFalse(hasattr(engine, "encode_reference"))
        parameters = _parameters(engine.prepare_reference)
        self.assertEqual(parameters[0][0], "ref_audio")
        for name in ("sr", "denoise", "use_ref_codes", "max_seconds"):
            match = next((entry for entry in parameters if entry[0] == name), None)
            self.assertIsNotNone(match, f"prepare_reference lost its {name} keyword")
            self.assertEqual(match[1], inspect.Parameter.KEYWORD_ONLY)

    def test_the_controlled_double_matches_the_installed_engine_signature(self):
        namespace: dict = {}
        exec(synthesis_fixture.SDK, namespace)  # noqa: S102 - controlled in-repo source
        double = namespace["OnnxV3LiteEngine"]
        self.assertEqual(
            _parameters(double.prepare_reference), _parameters(self.engine().prepare_reference)
        )
