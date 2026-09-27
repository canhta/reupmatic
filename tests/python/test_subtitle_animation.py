"""Exact ASS override tags per animation preset; no renderer required."""

import importlib.util
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "worker"))
from subtitles.animation import event_text, literal_ass
from subtitles.document import cue_document, srt_text
from subtitles.style import DEFAULT_STYLE

WIDTH, HEIGHT = 1920, 1080
WORDS = [
    {"text": "Hi ", "start_ms": 0, "end_ms": 400},
    {"text": "there", "start_ms": 400, "end_ms": 1000},
]


def style(in_preset="none", out_preset="none", emphasis="none", **overrides):
    return {
        **DEFAULT_STYLE,
        **overrides,
        "animation": {
            "in": {"preset": in_preset, "duration_ms": 200},
            "out": {"preset": out_preset, "duration_ms": 200},
            "emphasis": {"preset": emphasis},
        },
    }


def cue(text="Hi", start_ms=0, end_ms=1000, words=None):
    value = {"id": "1", "start_ms": start_ms, "end_ms": end_ms, "text": text}
    if words is not None:
        value["words"] = words
    return value


class EventTextTests(unittest.TestCase):
    def render(self, value, style_value):
        return event_text(value, style_value, WIDTH, HEIGHT)

    def test_whole_line_in_presets(self):
        self.assertEqual(self.render(cue(), style("fade")), r"{\fad(200,0)}Hi")
        self.assertEqual(
            self.render(cue(), style("pop")),
            r"{\fscx0\fscy0\t(0,120,\fscx110\fscy110)\t(120,200,\fscx100\fscy100)}Hi",
        )
        self.assertEqual(
            self.render(cue(), style("slide-up")), r"{\move(960,1080,960,1026,0,200)}Hi"
        )
        self.assertEqual(
            self.render(cue(), style("slide-left")), r"{\move(864,1026,960,1026,0,200)}Hi"
        )
        self.assertEqual(self.render(cue(), style("blur")), r"{\blur22\t(0,200,\blur0)}Hi")
        self.assertEqual(
            self.render(cue(text="Hi", end_ms=400), style("typewriter")),
            r"{\alpha&HFF&\t(0,0,\alpha&H00&)}H{\alpha&HFF&\t(100,100,\alpha&H00&)}i",
        )

    def test_whole_line_out_presets(self):
        self.assertEqual(self.render(cue(), style(out_preset="fade")), r"{\fad(0,200)}Hi")
        self.assertEqual(
            self.render(cue(), style(out_preset="pop-out")),
            r"{\t(800,1000,\fscx0\fscy0)}Hi",
        )
        self.assertEqual(
            self.render(cue(), style(out_preset="slide-down")),
            r"{\move(960,1026,960,1080,800,1000)}Hi",
        )

    def test_in_and_out_fades_share_one_tag(self):
        self.assertEqual(self.render(cue(), style("fade", out_preset="fade")), r"{\fad(200,200)}Hi")

    def test_word_emphasis_presets_use_measured_timings(self):
        words = WORDS
        self.assertEqual(
            self.render(cue(text="Hi there", words=words), style(emphasis="karaoke")),
            r"{\1c&H00D4FF&\2c&HFFFFFF&}{\kf40}Hi {\kf60}there",
        )
        self.assertEqual(
            self.render(cue(text="Hi there", words=words), style(emphasis="color")),
            r"{\c&H00D4FF&\t(0,0,\c&H00D4FF&)\t(400,400,\c&HFFFFFF&)}Hi "
            r"{\c&H00D4FF&\t(400,400,\c&H00D4FF&)\t(1000,1000,\c&HFFFFFF&)}there",
        )
        self.assertEqual(
            self.render(cue(text="Hi there", words=words), style(emphasis="pop")),
            r"{\t(0,0,\fscx120\fscy120)\t(400,400,\fscx100\fscy100)}Hi "
            r"{\t(400,400,\fscx120\fscy120)\t(1000,1000,\fscx100\fscy100)}there",
        )
        self.assertEqual(
            self.render(cue(text="Hi there", words=words), style(emphasis="appear")),
            r"{\alpha&HFF&\t(0,0,\alpha&H00&)}Hi "
            r"{\alpha&HFF&\t(400,400,\alpha&H00&)}there",
        )
        self.assertEqual(
            self.render(cue(text="Hi there", words=words), style(emphasis="one-at-a-time")),
            r"{\alpha&HFF&\t(0,0,\alpha&H00&)\t(400,400,\alpha&HFF&)}Hi "
            r"{\alpha&HFF&\t(400,400,\alpha&H00&)\t(1000,1000,\alpha&HFF&)}there",
        )

    def test_emphasis_without_measured_words_estimates_inside_the_window(self):
        text = self.render(cue(text="Xin chào"), style(emphasis="appear"))
        self.assertIn("Xin", text)
        self.assertIn("chào", text)
        self.assertTrue(text.startswith(r"{\alpha&HFF&\t(0,0,\alpha&H00&)}Xin"))

    def test_durations_never_run_past_the_cue_window(self):
        self.assertEqual(self.render(cue(end_ms=100), style("fade")), r"{\fad(100,0)}Hi")
        self.assertEqual(
            self.render(cue(end_ms=100), style(out_preset="pop-out")),
            r"{\t(0,100,\fscx0\fscy0)}Hi",
        )

    def test_uppercase_and_text_escaping(self):
        self.assertEqual(self.render(cue(text="hi"), style(uppercase=True)), "HI")
        escaped = self.render(cue(text=r"{\pos(0,0)}"), style())
        self.assertNotIn(r"{\pos", escaped)
        self.assertIn(r"\{", escaped)
        self.assertEqual(literal_ass("a\nb"), r"a\Nb")


@unittest.skipUnless(importlib.util.find_spec("pysubs2"), "pysubs2 required")
class DocumentAnimationTests(unittest.TestCase):
    def test_styled_document_carries_tags_and_srt_never_does(self):
        value = cue(text="Hi there", words=WORDS)
        styled = cue_document(
            [value], style("pop", emphasis="pop"), {"width": WIDTH, "height": HEIGHT}
        )
        text = styled.to_string("ass")
        self.assertIn(r"\fscx0\fscy0", text)
        srt = srt_text([value])
        self.assertNotIn(r"\fscx", srt)
        self.assertNotIn("{\\", srt)


if __name__ == "__main__":
    unittest.main()
