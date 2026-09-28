"""The shipped FFmpeg's libass (>= 0.17.5) fades a BorderStyle 4 box with `\\fad`.

Like `test_font_burn_native.py`, this needs the STAGED build at `ffmpeg/ffmpeg` (`pnpm run
stage:ffmpeg`), not the Homebrew FFmpeg from `.env.local`: the box fade is a libass version fact.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "worker"))
FFMPEG = ROOT / "ffmpeg" / "ffmpeg"
FONTS = ROOT / "fonts"
WIDTH, HEIGHT = 640, 360

HAS_NATIVE = bool(
    FFMPEG.exists()
    and (FONTS / "BeVietnamPro-Regular.ttf").exists()
    and importlib.util.find_spec("numpy")
    and importlib.util.find_spec("pysubs2")
)


@unittest.skipUnless(HAS_NATIVE, "staged FFmpeg + NumPy/pysubs2 required")
class BoxFadeNativeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="box-fade-")
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def document(self, emphasis):
        from subtitles.document import cue_document
        from subtitles.style import DEFAULT_STYLE

        style = {
            **DEFAULT_STYLE,
            "font_size_pct": 12,
            "text_color": "#FFFFFF",
            "outline_pct": 0,
            "box_color": "#FF0000",
            "box_opacity": 1,
            "box_padding_pct": 2,
            "animation": {
                "in": {"preset": "fade", "duration_ms": 1000},
                "out": {"preset": "fade", "duration_ms": 1000},
                "emphasis": {"preset": emphasis},
            },
        }
        cue = {
            "id": "1",
            "start_ms": 0,
            "end_ms": 3000,
            "text": "Hi",
            "words": [{"text": "Hi", "start_ms": 0, "end_ms": 3000}],
        }
        path = self.root / f"{emphasis}.ass"
        cue_document([cue], style, {"width": WIDTH, "height": HEIGHT}).save(
            str(path), encoding="utf-8", format_="ass"
        )
        return path

    def levels(self, track, seconds):
        """The brightest box (red, no green) and text (green) channel values at `seconds`."""
        import numpy as np
        from media.editing.filters import subtitle_filter

        frame = subprocess.run(
            [
                str(FFMPEG),
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                f"color=black:s={WIDTH}x{HEIGHT}:d=3:r=25",
                "-vf",
                subtitle_filter(track, FONTS),
                "-ss",
                f"{seconds:.2f}",
                "-frames:v",
                "1",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "-",
            ],
            capture_output=True,
            check=True,
        ).stdout
        pixels = np.frombuffer(frame, dtype=np.uint8).reshape(HEIGHT, WIDTH, 3).astype(int)
        box = pixels[..., 0][pixels[..., 1] < 16]
        return int(box.max(initial=0)), int(pixels[..., 1].max())

    def assert_fades(self, track):
        box_start, text_start = self.levels(track, 0.04)
        box_mid, text_mid = self.levels(track, 0.5)
        box_full, text_full = self.levels(track, 1.5)
        box_end, text_end = self.levels(track, 2.96)
        self.assertGreater(box_full, 240, "the box must be opaque between the fades")
        self.assertGreater(text_full, 240, "the text must be opaque between the fades")
        for label, value in (("box", box_start), ("text", text_start), ("box", box_end)):
            self.assertLess(value, 40, f"the {label} must start and end nearly transparent")
        self.assertLess(text_end, 40, "the text must end nearly transparent")
        # Halfway through the fade-in, both sit near half strength: a fade, not a pop.
        self.assertTrue(80 < box_mid < 180, f"box mid-fade {box_mid}")
        self.assertTrue(80 < text_mid < 180, f"text mid-fade {text_mid}")

    def test_boxed_fade_in_and_out_reach_the_box(self):
        self.assert_fades(self.document("none"))

    def test_word_effects_fade_with_the_line_instead_of_popping(self):
        self.assert_fades(self.document("appear"))
        self.assert_fades(self.document("one-at-a-time"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
