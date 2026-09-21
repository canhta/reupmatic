"""Filter-graph assertions for rotate and head/tail fades.

These pin the exact FFmpeg filter chain the worker emits, so a preview or
contract change that silently drops a rotate/fade stage fails here rather than
only in a rendered pixel comparison.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from media.audio.mixing import audio_output_filters  # noqa: E402
from media.editing.filters import (  # noqa: E402
    audio_fade_filters,
    audio_filters,
    geometry_filters,
    logo_overlay,
    video_fade_filters,
)
from media.editing.recipe import parse_editing, resolve_fade_window  # noqa: E402
from runtime.errors import WorkerError  # noqa: E402

INFO = {"width": 1920, "height": 1080, "has_audio": True, "frame_rate": "30"}


class GeometryFilterTests(unittest.TestCase):
    def test_rotate_precedes_crop_and_flip(self):
        edit = parse_editing(
            {
                "rotate": 90,
                "crop": {"x": 0.25, "y": 0, "width": 0.5, "height": 1},
                "flip": "both",
            }
        )
        filters, (width, height) = geometry_filters(edit, INFO)
        self.assertIn("transpose=1", filters)
        self.assertLess(
            filters.index("transpose=1"),
            next(index for index, value in enumerate(filters) if value.startswith("crop=")),
        )
        self.assertLess(
            next(index for index, value in enumerate(filters) if value.startswith("crop=")),
            filters.index("hflip"),
        )
        self.assertIn("hflip", filters)
        self.assertIn("vflip", filters)
        # 90 and 270 swap the frame before the crop is measured: the 50%-wide,
        # full-height crop of the 1080x1920 rotated frame is 540x1920.
        self.assertEqual((width, height), (540, 1920))

    def test_rotate_uses_the_expected_transpose_per_quarter(self):
        for rotate, expected in [(90, "transpose=1"), (180, "hflip,vflip"), (270, "transpose=2")]:
            filters, _ = geometry_filters({"rotate": rotate}, INFO)
            self.assertIn(expected, filters)
        self.assertEqual(geometry_filters({}, INFO)[0][0], "scale=2*trunc(iw*sar/2):2*trunc(ih/2)")

    def test_rotate_zero_emits_no_transpose(self):
        filters, (width, height) = geometry_filters({"rotate": 0}, INFO)
        self.assertFalse(any("transpose" in value for value in filters))
        self.assertEqual((width, height), (1920, 1080))

    def test_invalid_rotate_is_rejected(self):
        with self.assertRaisesRegex(WorkerError, "INVALID_EDITING"):
            parse_editing({"rotate": 45})


class FadeFilterTests(unittest.TestCase):
    def test_head_and_tail_video_fades_sit_on_the_output_clock(self):
        edit = parse_editing({"fade": {"in_ms": 500, "out_ms": 250, "audio": False}})
        self.assertEqual(
            video_fade_filters(edit, 4000),
            ["fade=t=in:st=0:d=0.500", "fade=t=out:st=3.750:d=0.250"],
        )

    def test_audio_fade_only_when_requested(self):
        silent = parse_editing({"fade": {"in_ms": 500, "out_ms": 0, "audio": False}})
        self.assertEqual(audio_fade_filters(silent, 4000), [])
        audible = parse_editing({"fade": {"in_ms": 500, "out_ms": 250, "audio": True}})
        self.assertEqual(
            audio_fade_filters(audible, 4000),
            ["afade=t=in:st=0:d=0.500", "afade=t=out:st=3.750:d=0.250"],
        )

    def test_audio_fades_ride_the_output_clock_after_gain_and_speed(self):
        edit = parse_editing(
            {
                "speed": 2,
                "audio": {"muted": False, "gain_db": -3},
                "fade": {"in_ms": 200, "out_ms": 0, "audio": True},
            }
        )
        filters = audio_filters(0, 4000, 2, edit["audio"], 2000)
        self.assertIn("atempo=2.000000000", filters)
        self.assertIn("volume=-3dB", filters)
        self.assertEqual(filters[-1], "atrim=duration=2.000")
        self.assertFalse(any("afade" in value for value in filters))
        # The fade is appended on the output clock by the mixing stage instead.
        self.assertEqual(
            audio_output_filters(edit, 0, None, 2000, True),
            ["afade=t=in:st=0:d=0.200"],
        )

    def test_fade_corrected_sample_shifts_fades_then_trims(self):
        edit = parse_editing({"fade": {"in_ms": 1000, "out_ms": 1000, "audio": True}})
        self.assertEqual(
            audio_output_filters(edit, 3200, (3200, 3800), 4000, True),
            [
                "asetpts=PTS+3.200000/TB",
                "afade=t=in:st=0:d=1.000",
                "afade=t=out:st=3.000:d=1.000",
                "atrim=start=3.200:end=3.800",
                "asetpts=PTS-STARTPTS",
            ],
        )

    def test_fade_window_widens_only_when_a_fade_touches_the_sample(self):
        editing = {"fade": {"in_ms": 1000, "out_ms": 1000, "audio": False}}
        window, sample, full = resolve_fade_window(editing, 4000, {"start_ms": 200, "end_ms": 800})
        # Head sample: decode from the output head, trim back to the sample.
        self.assertEqual((window["start_ms"], window["end_ms"]), (0, 800))
        self.assertEqual(sample, (200, 800))
        self.assertEqual(full, 4000)
        window, sample, _ = resolve_fade_window(editing, 4000, {"start_ms": 3200, "end_ms": 3800})
        # Tail sample: decode through the output end, trim back to the sample.
        self.assertEqual((window["start_ms"], window["end_ms"]), (3200, 4000))
        self.assertEqual(sample, (3200, 3800))
        # A mid-output sample is untouched by either fade.
        window, sample, _ = resolve_fade_window(editing, 4000, {"start_ms": 1500, "end_ms": 2500})
        self.assertIsNone(sample)
        self.assertEqual((window["start_ms"], window["end_ms"]), (1500, 2500))
        # A full render is never a sample.
        self.assertIsNone(resolve_fade_window(editing, 4000, None)[1])

    def test_no_fade_emits_nothing(self):
        edit = parse_editing({"speed": 1})
        self.assertEqual(video_fade_filters(edit, 1000), [])
        self.assertEqual(audio_fade_filters(edit, 1000), [])

    def test_fade_longer_than_the_window_is_clamped_to_the_end(self):
        edit = parse_editing({"fade": {"in_ms": 0, "out_ms": 900, "audio": False}})
        self.assertEqual(video_fade_filters(edit, 500), ["fade=t=out:st=0.000:d=0.900"])


class LogoOverlayTests(unittest.TestCase):
    """The logo's `overlay` placement is one function, so preview and export agree."""

    def logo(self, **overrides):
        return {
            "anchor": "bottom-right",
            "margin": 0.05,
            "scale": 0.2,
            "opacity": 1,
            **overrides,
        }

    def test_the_logo_scales_from_the_output_width_and_sits_at_its_anchor(self):
        filters, x, y = logo_overlay(self.logo(), (1000, 1000))
        self.assertEqual(filters, ["scale=200:-2", "format=rgba"])
        self.assertEqual(x, "main_w-overlay_w-50")
        self.assertEqual(y, "main_h-overlay_h-50")
        filters, x, y = logo_overlay(self.logo(anchor="center"), (1000, 1000))
        self.assertEqual(x, "(main_w-overlay_w)/2")
        self.assertEqual(y, "(main_h-overlay_h)/2")
        filters, x, y = logo_overlay(self.logo(anchor="top-left"), (1000, 1000))
        self.assertEqual(x, "50")
        self.assertEqual(y, "50")

    def test_opacity_below_one_multiplies_the_logo_alpha(self):
        filters, _, _ = logo_overlay(self.logo(opacity=0.4), (1000, 1000))
        self.assertEqual(
            filters, ["scale=200:-2", "format=rgba", "colorchannelmixer=aa=0.400000000"]
        )

    def test_a_clear_logo_needs_no_alpha_filter(self):
        filters, _, _ = logo_overlay(self.logo(opacity=1), (1000, 1000))
        self.assertFalse(any("colorchannelmixer" in value for value in filters))

    def test_the_placement_and_reference_parse_into_one_shape(self):
        edit = parse_editing(
            {
                "logo": {
                    "media_id": "media_00000001",
                    "anchor": "top-center",
                    "margin": 0.02,
                    "scale": 0.3,
                    "opacity": 0.5,
                }
            }
        )
        self.assertEqual(
            edit["logo"],
            {
                "anchor": "top-center",
                "margin": 0.02,
                "scale": 0.3,
                "opacity": 0.5,
                "media_id": "media_00000001",
            },
        )

    def test_an_invalid_placement_fails_before_the_filter(self):
        for logo in (
            {"anchor": "middle", "margin": 0, "scale": 0.2, "opacity": 1},
            {"anchor": "center", "margin": 0.6, "scale": 0.2, "opacity": 1},
            {"anchor": "center", "margin": 0, "scale": 2, "opacity": 1},
            {"anchor": "center", "margin": 0, "scale": 0.2, "opacity": 2},
        ):
            with self.assertRaisesRegex(WorkerError, "INVALID_EDITING"):
                parse_editing({"logo": logo})


if __name__ == "__main__":
    unittest.main(verbosity=2)
