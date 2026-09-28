"""Style contract/math tests; real pysubs2 cases explicitly skip when unavailable."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from processing.recipe import parse_recipe, required_models
from runtime.errors import WorkerError
from subtitles.document import cue_document, literal_ass, srt_text
from subtitles.fonts import FONT_FAMILIES, require_fonts_dir
from subtitles.style import DEFAULT_STYLE, ass_style, parse_style
from subtitles.validation import validate_cues

ROOT = Path(__file__).resolve().parents[2]


class BundledFontTests(unittest.TestCase):
    def test_the_bundled_font_directory_is_required(self):
        self.assertEqual(FONT_FAMILIES, ("Be Vietnam Pro",))
        self.assertEqual(require_fonts_dir(ROOT / "fonts"), ROOT / "fonts")
        for bad in ("", None, str(ROOT / "missing-fonts")):
            with (
                self.subTest(bad=bad),
                self.assertRaisesRegex(WorkerError, "SUBTITLE_FONT_MISSING"),
            ):
                require_fonts_dir(bad)

    def test_a_directory_missing_one_bundled_file_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            partial = Path(directory)
            (partial / "BeVietnamPro-Regular.ttf").write_bytes(b"not a font")
            with self.assertRaisesRegex(WorkerError, "SUBTITLE_FONT_MISSING"):
                require_fonts_dir(partial)


class SubtitleStyleTests(unittest.TestCase):
    def test_styles_are_strict_and_style_only_recipe_has_no_models(self):
        self.assertEqual(DEFAULT_STYLE["font_family"], "Be Vietnam Pro")
        style = parse_style({**DEFAULT_STYLE, "text_color": "#ab12cd"})
        self.assertEqual(style["text_color"], "#AB12CD")
        self.assertEqual(style["font_family"], "Be Vietnam Pro")
        self.assertEqual(required_models(parse_recipe({"subtitle_style": style})), [])
        for patch in (
            {"font_family": "Arial"},
            {"font_family": "Helvetica"},
            {"font_family": "DejaVu Sans"},
            {"font_family": "Arial,10"},
            {"font_family": "Arial\nOverride"},
            {"text_color": "red"},
            {"box_opacity": 1.1},
            {"position": True},
            {"position": 1.5},
            {"bold": 1},
            {"font_size_pct": float("nan")},
            {"unknown": 1},
        ):
            with (
                self.subTest(patch=patch),
                self.assertRaisesRegex(WorkerError, "INVALID_SUBTITLE_STYLE"),
            ):
                parse_style({**DEFAULT_STYLE, **patch})
        validate_cues([{"id": "1", "start_ms": 0, "end_ms": 1000, "text": "Việt", "style": style}])

    def test_percent_to_ass_unit_mapping_and_box_alpha(self):
        adapter = SimpleNamespace(
            Color=lambda *args: args, Alignment=int, SSAStyle=lambda **args: args
        )
        style = ass_style(adapter, {**DEFAULT_STYLE, "box_opacity": 0.5}, 720, 1280)
        self.assertAlmostEqual(style["fontsize"], 57.6)
        self.assertEqual(style["marginl"], 43)
        self.assertEqual(style["marginv"], 64)
        self.assertEqual(style["borderstyle"], 4)
        self.assertEqual(style["backcolor"][3], 128)
        self.assertEqual(style["outlinecolor"], (0, 0, 0, 0))

    def test_box_padding_and_text_outline_are_independent(self):
        adapter = SimpleNamespace(
            Color=lambda *args: args, Alignment=int, SSAStyle=lambda **args: args
        )
        boxed = {
            **DEFAULT_STYLE,
            "box_color": "#112233",
            "box_opacity": 1,
            "outline_color": "#FF0000",
        }
        base = ass_style(adapter, {**boxed, "outline_pct": 0.5, "box_padding_pct": 1}, 1920, 1000)
        wider_outline = ass_style(
            adapter, {**boxed, "outline_pct": 1.5, "box_padding_pct": 1}, 1920, 1000
        )
        wider_padding = ass_style(
            adapter, {**boxed, "outline_pct": 0.5, "box_padding_pct": 3}, 1920, 1000
        )
        # libass BorderStyle 4: Outline outlines the text, Shadow pads the BackColour box.
        self.assertEqual(base["borderstyle"], 4)
        self.assertEqual((base["outline"], base["shadow"]), (5, 10))
        self.assertEqual((wider_outline["outline"], wider_outline["shadow"]), (15, 10))
        self.assertEqual((wider_padding["outline"], wider_padding["shadow"]), (5, 30))
        self.assertEqual(base["outlinecolor"], (255, 0, 0, 0))
        self.assertEqual(base["backcolor"], (0x11, 0x22, 0x33, 0))
        unboxed = ass_style(adapter, {**DEFAULT_STYLE, "box_padding_pct": 3}, 1920, 1000)
        self.assertEqual(unboxed["borderstyle"], 1)
        self.assertAlmostEqual(unboxed["shadow"], 1000 * DEFAULT_STYLE["shadow_pct"] / 100)

    def test_box_padding_is_bounded_and_required(self):
        self.assertEqual(parse_style({**DEFAULT_STYLE, "box_padding_pct": 4})["box_padding_pct"], 4)
        missing = {key: value for key, value in DEFAULT_STYLE.items() if key != "box_padding_pct"}
        for bad in (
            {**DEFAULT_STYLE, "box_padding_pct": -0.1},
            {**DEFAULT_STYLE, "box_padding_pct": 4.1},
            {**DEFAULT_STYLE, "box_padding_pct": "1"},
            {**DEFAULT_STYLE, "box_padding_pct": float("inf")},
            missing,
        ):
            with (
                self.subTest(bad=bad.get("box_padding_pct")),
                self.assertRaisesRegex(WorkerError, "INVALID_SUBTITLE_STYLE"),
            ):
                parse_style(bad)

    def test_literal_text_cannot_inject_ass_commands(self):
        encoded = literal_ass("Việt {\\pos(0,0)} \\N\nline two")
        self.assertIn(r"\{", encoded)
        self.assertNotIn(r"{\pos", encoded)
        self.assertEqual(encoded.count(r"\N"), 1)


@unittest.skipUnless(importlib.util.find_spec("pysubs2"), "pysubs2 required")
class SubtitleSerializationTests(unittest.TestCase):
    def test_global_and_override_styles_are_serialized_at_frame_size(self):
        cues = [
            {"id": "1", "start_ms": 100, "end_ms": 1900, "text": "Tiếng Việt"},
            {
                "id": "2",
                "start_ms": 2000,
                "end_ms": 3000,
                "text": "English",
                "style": {**DEFAULT_STYLE, "bold": True, "position": 8},
            },
        ]
        document = cue_document(
            cues, {**DEFAULT_STYLE, "font_size_pct": 5}, {"width": 720, "height": 1280}
        )
        text = document.to_string("ass")
        self.assertEqual(document.info["PlayResX"], "720")
        self.assertEqual(document.styles["Default"].fontname, "Be Vietnam Pro")
        self.assertEqual(document.styles["Default"].fontsize, 64)
        self.assertEqual(document[1].style, "Cue1")
        self.assertTrue(document.styles["Cue1"].bold)
        self.assertIn("Tiếng Việt", text)

    def test_a_boxed_style_serializes_as_border_style_4_with_padding_in_shadow(self):
        boxed = {**DEFAULT_STYLE, "box_opacity": 1, "outline_pct": 0.2, "box_padding_pct": 2}
        document = cue_document(
            [{"id": "1", "start_ms": 0, "end_ms": 1000, "text": "Hi"}],
            boxed,
            {"width": 1920, "height": 1000},
        )
        line = next(
            row
            for row in document.to_string("ass").splitlines()
            if row.startswith("Style: Default")
        )
        fields = line.split(",")
        # Format order: ..., BorderStyle, Outline, Shadow, Alignment, ...
        self.assertEqual(fields[15:18], ["4", "2", "20"])

    def test_srt_retains_literal_text_and_never_emits_global_style(self):
        text = "{\\pos(0,0)} literal \\N\nTiếng Việt"
        cues = [
            {
                "id": "1",
                "start_ms": 123,
                "end_ms": 1456,
                "text": text,
                "style": {**DEFAULT_STYLE, "bold": True},
            }
        ]
        output = srt_text(cues)
        self.assertIn("00:00:00,123 --> 00:00:01,456", output)
        self.assertIn(text, output)
        self.assertNotIn("[V4+ Styles]", output)
        self.assertNotIn("<b>", output)
