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
    def render(self, value, style_value, line_length=None, frame=(WIDTH, HEIGHT)):
        return event_text(value, style_value, frame[0], frame[1], line_length)

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
            r"{\alpha&HFF&\t(0,100,\alpha&H00&)}H{\alpha&HFF&\t(100,200,\alpha&H00&)}i",
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
        # Base at rest; only the active word turns to the accent colour.
        self.assertEqual(
            self.render(cue(text="Hi there", words=words), style(emphasis="color")),
            r"{\c&HFFFFFF&\t(0,40,\c&H00D4FF&)\t(400,440,\c&HFFFFFF&)}Hi "
            r"{\c&HFFFFFF&\t(400,440,\c&H00D4FF&)\t(1000,1000,\c&HFFFFFF&)}there",
        )
        # A short eased transient, not a hold for the whole word.
        self.assertEqual(
            self.render(cue(text="Hi there", words=words), style(emphasis="pop")),
            r"{\t(0,80,0.5,\fscx115\fscy115)\t(80,200,0.5,\fscx100\fscy100)}Hi "
            r"{\t(400,480,0.5,\fscx115\fscy115)\t(480,600,0.5,\fscx100\fscy100)}there",
        )
        self.assertEqual(
            self.render(cue(text="Hi there", words=words), style(emphasis="appear")),
            r"{\alpha&HFF&\t(0,40,\alpha&H00&)}Hi "
            r"{\alpha&HFF&\t(400,440,\alpha&H00&)}there",
        )
        self.assertEqual(
            self.render(cue(text="Hi there", words=words), style(emphasis="one-at-a-time")),
            r"{\alpha&HFF&\t(0,40,\alpha&H00&)\t(400,440,\alpha&HFF&)}Hi "
            r"{\alpha&HFF&\t(400,440,\alpha&H00&)\t(1000,1000,\alpha&HFF&)}there",
        )

    def test_lines_are_broken_explicitly_so_libass_never_re_wraps(self):
        narrow = style()
        narrow["font_size_pct"] = 15
        text = "aaaa bbbb cccc dddd eeee"
        plain = self.render(cue(text=text, end_ms=1000), narrow)
        self.assertIn(r"aaaa bbbb\Ncccc dddd eeee", plain)
        words = [
            {"text": "aaaa ", "start_ms": 0, "end_ms": 200},
            {"text": "bbbb ", "start_ms": 200, "end_ms": 400},
            {"text": "cccc ", "start_ms": 400, "end_ms": 600},
            {"text": "dddd ", "start_ms": 600, "end_ms": 800},
            {"text": "eeee", "start_ms": 800, "end_ms": 1000},
        ]
        popped = self.render(
            cue(text=text, words=words),
            {
                **narrow,
                "animation": {
                    "in": {"preset": "none", "duration_ms": 200},
                    "out": {"preset": "none", "duration_ms": 200},
                    "emphasis": {"preset": "pop"},
                },
            },
        )
        self.assertIn(r"bbbb\N", popped)

    def test_line_breaks_are_balanced_not_greedy(self):
        portrait = (1080, 1920)
        # Vietnamese: the old greedy break left "ý" alone; balanced keeps both lines close.
        self.assertIn(
            r"Chữ đậm thu\Nhút sự chú ý",
            self.render(cue(text="Chữ đậm thu hút sự chú ý", end_ms=1000), style(), frame=portrait),
        )
        self.assertIn(
            r"Bold words\Nwin attention",
            self.render(cue(text="Bold words win attention", end_ms=1000), style(), frame=portrait),
        )
        # A break after punctuation is preferred when it is the most balanced option.
        self.assertIn(
            r"Hello world.\NGood night",
            self.render(cue(text="Hello world. Good night", end_ms=1000), style(), frame=portrait),
        )

    def test_chinese_breaks_between_characters_never_before_closing_punctuation(self):
        portrait = (1080, 1920)
        self.assertIn(
            r"你好世界，再\N见朋友明天见",
            self.render(cue(text="你好世界，再见朋友明天见", end_ms=1000), style(), frame=portrait),
        )
        broken = self.render(
            cue(text="你好世界，再见朋友，明天见！", end_ms=1000), style(), frame=portrait
        )
        self.assertIn(r"你好世界，再见\N朋友，明天见！", broken)
        self.assertNotIn(r"\N，", broken)
        self.assertNotIn(r"\N！", broken)

    def test_one_max_line_never_breaks(self):
        long_text = "Chữ đậm thu hút sự chú ý của mọi người"
        self.assertNotIn(
            r"\N",
            self.render(
                cue(text=long_text, end_ms=1000),
                style(),
                line_length={"mode": "custom", "cps": 17, "max_lines": 1, "max_chars": 60},
                frame=(1080, 1920),
            ),
        )

    def test_emphasis_without_measured_words_estimates_inside_the_window(self):
        text = self.render(cue(text="Xin chào"), style(emphasis="appear"))
        self.assertIn("Xin", text)
        self.assertIn("chào", text)
        self.assertTrue(text.startswith(r"{\alpha&HFF&\t(0,40,\alpha&H00&)}Xin"))

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
        self.assertEqual(styled.info["WrapStyle"], "2")
        srt = srt_text([value])
        self.assertNotIn(r"\fscx", srt)
        self.assertNotIn("{\\", srt)

    def test_project_line_length_settings_reach_the_burn(self):
        long = cue(text="Chữ đậm thu hút sự chú ý của mọi người", end_ms=1000)
        canvas = {"width": 1080, "height": 1920}
        single = cue_document(
            [long],
            style(),
            canvas,
            line_length={"mode": "custom", "cps": 17, "max_lines": 1, "max_chars": 60},
        )
        self.assertNotIn(r"\N", single.to_string("ass"))
        split = cue_document(
            [long],
            style(),
            canvas,
            line_length={"mode": "custom", "cps": 17, "max_lines": 2, "max_chars": 20},
        )
        self.assertIn(r"\N", split.to_string("ass"))


if __name__ == "__main__":
    unittest.main()
