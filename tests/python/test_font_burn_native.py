"""F2: the shipped FFmpeg burns the bundled font, not a system fallback.

This test needs the STAGED FFmpeg at `ffmpeg/ffmpeg` (the static build packaging ships), not the
Homebrew `ffmpeg-full` from `.env.local`. It burns a Vietnamese line with `fontsdir=<bundled>` and
without, and pins the width libass reports for Be Vietnam Pro.
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
TEXT = "Xin chào, phụ đề tiếng Việt"
# The width libass reports for Be Vietnam Pro at 48 px in this 640x360 script, on the shipped build.
BUNDLED_WIDTH_PX = 410

HAS_NATIVE = bool(
    FFMPEG.exists()
    and (FONTS / "BeVietnamPro-Regular.ttf").exists()
    and importlib.util.find_spec("numpy")
    and importlib.util.find_spec("cv2")
)

ASS = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Be Vietnam Pro,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,{TEXT}
"""


@unittest.skipUnless(HAS_NATIVE, "staged FFmpeg + NumPy/OpenCV required")
class BundledFontBurnTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="font-burn-")
        self.root = Path(self.temp.name)
        self.ass = self.root / "cue.ass"
        self.ass.write_text(ASS, encoding="utf-8")
        self.empty_fonts = self.root / "no-fonts"
        self.empty_fonts.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def burn(self, fonts_dir: Path | None) -> tuple[int, int]:
        import cv2
        import numpy as np

        image = self.root / f"frame-{fonts_dir is not None}.png"
        filter_value = f"subtitles={self.ass}"
        if fonts_dir is not None:
            filter_value += f":fontsdir={fonts_dir}"
        subprocess.run(
            [
                str(FFMPEG),
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=black:s=640x360:d=0.1",
                "-vf",
                filter_value,
                "-frames:v",
                "1",
                "-y",
                str(image),
            ],
            check=True,
        )
        pixels = cv2.imread(str(image), cv2.IMREAD_GRAYSCALE)
        mask = np.asarray(pixels) > 20
        columns = np.where(mask.any(axis=0))[0]
        width = int(columns[-1] - columns[0] + 1) if len(columns) else 0
        return width, int(mask.sum())

    def test_bundled_font_burns_and_is_not_a_system_fallback(self):
        bundled_width, bundled_pixels = self.burn(FONTS)
        fallback_width, _ = self.burn(self.empty_fonts)
        self.assertGreater(bundled_pixels, 0, "the Vietnamese line must burn visible glyphs")
        # A fallback font has different metrics; the bundled width cannot match it.
        self.assertGreater(
            abs(bundled_width - fallback_width),
            0.1 * fallback_width,
            "the bundled font was not used (width matches the fallback)",
        )
        self.assertLessEqual(
            abs(bundled_width - BUNDLED_WIDTH_PX),
            12,
            "the width libass reports for Be Vietnam Pro changed",
        )

    def test_the_font_directory_reaches_libass_through_the_filter(self):
        from media.editing.filters import subtitle_filter

        value = subtitle_filter("cue.ass", FONTS)
        self.assertIn("fontsdir=", value)
        self.assertIn(str(FONTS), value.replace("\\:", ":"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
