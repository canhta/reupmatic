"""A disabled clip never opens its source and never enters the ffmpeg graph."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from media.composition.assembly import assembly_arguments
from media.composition.document import parse_composition


class _Assets:
    def get(self, asset_id, kind):
        raise AssertionError(f"disabled clip opened source {asset_id}")


class _Host:
    ffmpeg = "ffmpeg"
    runtime_identity = {}
    assets = _Assets()


class CompositionDisabledGraph(unittest.TestCase):
    def test_disabled_clip_source_is_absent_from_the_ffmpeg_graph(self):
        document = {
            "canvas": {"width": 320, "height": 180, "fps": 30},
            "clips": [
                {
                    "id": "off",
                    "source": {
                        "asset_id": "disabled-asset",
                        "sha256": "a" * 64,
                        "duration_ms": 2000,
                    },
                    "start_ms": 0,
                    "end_ms": 2000,
                    "speed": 1,
                    "enabled": False,
                }
            ],
        }
        parsed, spans, duration = parse_composition(document)
        args, milliseconds = assembly_arguments(
            _Host(), {}, parsed, spans, {"start_ms": 0, "end_ms": 2000}, Path("out.mkv")
        )
        self.assertEqual(duration, 2000)
        self.assertEqual(milliseconds, 2000)
        self.assertNotIn("disabled-asset", " ".join(args))
        self.assertNotIn("-i", args)
        graph = args[args.index("-filter_complex") + 1]
        self.assertIn("color=c=black", graph)
        self.assertIn("anullsrc", graph)
        self.assertIn("concat=n=1", graph)


if __name__ == "__main__":
    unittest.main()
