"""Style contract/math tests; real pysubs2 cases explicitly skip when unavailable."""

import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
from processing.recipe import parse_recipe, required_models
from runtime.errors import WorkerError
from subtitles.document import cue_document, literal_ass, srt_text
from subtitles.style import DEFAULT_STYLE, ass_style, parse_style
from subtitles.validation import validate_cues

ROOT = Path(__file__).resolve().parents[1]


class SubtitleStyleTests(unittest.TestCase):
    def test_styles_are_strict_and_style_only_recipe_has_no_models(self):
        style = parse_style({**DEFAULT_STYLE, "text_color": "#ab12cd"})
        self.assertEqual(style["text_color"], "#AB12CD")
        self.assertEqual(required_models(parse_recipe({"version": 1, "subtitle_style": style})), [])
        for patch in (
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
        self.assertEqual(style["borderstyle"], 3)
        self.assertEqual(style["outlinecolor"][3], 128)
        self.assertEqual(style["shadow"], 0)

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
        self.assertEqual(document.styles["Default"].fontsize, 64)
        self.assertEqual(document[1].style, "Cue1")
        self.assertTrue(document.styles["Cue1"].bold)
        self.assertIn("Tiếng Việt", text)

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
