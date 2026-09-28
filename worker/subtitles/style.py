import math
import re

from runtime.errors import WorkerError

from subtitles.fonts import FONT_FAMILIES

DEFAULT_STYLE = {
    "font_family": "Be Vietnam Pro",
    "font_size_pct": 4.5,
    "text_color": "#FFFFFF",
    "outline_color": "#000000",
    "outline_pct": 0.2,
    "shadow_pct": 0.1,
    "box_color": "#000000",
    "box_opacity": 0,
    "box_padding_pct": 0.5,
    "position": 2,
    "margin_x_pct": 6,
    "margin_y_pct": 5,
    "spacing_pct": 0,
    "bold": False,
    "italic": False,
    "uppercase": False,
    "accent_color": "#FFD400",
    "animation": {
        "in": {"preset": "none", "duration_ms": 200},
        "out": {"preset": "none", "duration_ms": 200},
        "emphasis": {"preset": "none"},
    },
    "cover": None,
}

IN_PRESETS = ("none", "fade", "pop", "slide-up", "slide-left", "typewriter", "blur")
OUT_PRESETS = ("none", "fade", "pop-out", "slide-down")
EMPHASIS_PRESETS = ("none", "karaoke", "color", "pop", "appear", "one-at-a-time")
COVER_KEYS = ("x_pct", "y_pct", "width_pct", "height_pct", "color", "opacity")


def _animation(value):
    if not isinstance(value, dict) or set(value) != {"in", "out", "emphasis"}:
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    for key, presets in (("in", IN_PRESETS), ("out", OUT_PRESETS), ("emphasis", EMPHASIS_PRESETS)):
        part = value[key]
        with_duration = key != "emphasis"
        keys = {"preset", "duration_ms"} if with_duration else {"preset"}
        if not isinstance(part, dict) or set(part) != keys or part["preset"] not in presets:
            raise WorkerError("INVALID_SUBTITLE_STYLE")
        if with_duration and (
            type(part["duration_ms"]) is not int or not 0 <= part["duration_ms"] <= 3000
        ):
            raise WorkerError("INVALID_SUBTITLE_STYLE")
    return {
        "in": dict(value["in"]),
        "out": dict(value["out"]),
        "emphasis": dict(value["emphasis"]),
    }


def parse_style(value):
    if not isinstance(value, dict) or value.keys() != DEFAULT_STYLE.keys():
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    font = value["font_family"]
    if (
        not isinstance(font, str)
        or font not in FONT_FAMILIES
        or type(value["bold"]) is not bool
        or type(value["italic"]) is not bool
        or type(value["uppercase"]) is not bool
    ):
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    for key in ("text_color", "outline_color", "box_color", "accent_color"):
        if not isinstance(value[key], str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", value[key]):
            raise WorkerError("INVALID_SUBTITLE_STYLE")
    ranges = {
        "font_size_pct": (1, 15),
        "outline_pct": (0, 2),
        "shadow_pct": (0, 2),
        "box_opacity": (0, 1),
        "box_padding_pct": (0, 4),
        "position": (1, 9),
        "margin_x_pct": (0, 40),
        "margin_y_pct": (0, 40),
        "spacing_pct": (-0.2, 2),
    }
    for key, (minimum, maximum) in ranges.items():
        field = value[key]
        if (
            type(field) not in (int, float)
            or not math.isfinite(field)
            or not minimum <= field <= maximum
        ):
            raise WorkerError("INVALID_SUBTITLE_STYLE")
    if int(value["position"]) != value["position"]:
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    return {
        **value,
        "font_family": font.strip(),
        **{
            key: value[key].upper()
            for key in ("text_color", "outline_color", "box_color", "accent_color")
        },
        "animation": _animation(value["animation"]),
        "cover": _cover(value["cover"]),
    }


def _cover(value):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != set(COVER_KEYS):
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    for key in ("x_pct", "y_pct"):
        _bounded(value[key], 0, 100)
    for key in ("width_pct", "height_pct"):
        _bounded(value[key], 0, 100, exclusive_min=True)
    _bounded(value["opacity"], 0, 1)
    if (
        value["x_pct"] + value["width_pct"] > 100 + 1e-9
        or value["y_pct"] + value["height_pct"] > 100 + 1e-9
    ):
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    if not isinstance(value["color"], str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", value["color"]):
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    return {**value, "color": value["color"].upper()}


def _bounded(value, minimum, maximum, exclusive_min=False):
    if type(value) not in (int, float) or not math.isfinite(value):
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    if value < minimum or value > maximum or (exclusive_min and value <= minimum):
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    return value


def parse_line_length(value):
    """The project's A2 line-length settings, so burn-time wrapping matches the splitter."""
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) != {"mode", "cps", "max_lines", "max_chars"}:
        raise WorkerError("INVALID_REQUEST")
    if value["mode"] not in ("auto", "custom"):
        raise WorkerError("INVALID_REQUEST")
    if type(value["max_lines"]) is not int or value["max_lines"] not in (1, 2):
        raise WorkerError("INVALID_REQUEST")
    cps = value["cps"]
    if cps is not None and (
        type(cps) not in (int, float) or not math.isfinite(cps) or not 0 < cps <= 100
    ):
        raise WorkerError("INVALID_REQUEST")
    max_chars = value["max_chars"]
    if max_chars is not None and (type(max_chars) is not int or not 1 <= max_chars <= 500):
        raise WorkerError("INVALID_REQUEST")
    return dict(value)


def boxed(style):
    return style["box_opacity"] > 0


def ass_style(lib, value, width, height):
    style = parse_style(value)

    def color(hex_value, opacity=1):
        return lib.Color(
            *(int(hex_value[n : n + 2], 16) for n in (1, 3, 5)), round(255 * (1 - opacity))
        )

    box = boxed(style)
    return lib.SSAStyle(
        fontname=style["font_family"],
        fontsize=height * style["font_size_pct"] / 100,
        primarycolor=color(style["text_color"]),
        bold=style["bold"],
        italic=style["italic"],
        outlinecolor=color(style["outline_color"]),
        backcolor=color(style["box_color"], style["box_opacity"]) if box else color("#000000"),
        # libass BorderStyle 4: one BackColour box padded by Shadow; \fad reaches it from 0.17.5.
        borderstyle=4 if box else 1,
        outline=height * style["outline_pct"] / 100,
        shadow=height * (style["box_padding_pct"] if box else style["shadow_pct"]) / 100,
        alignment=lib.Alignment(int(style["position"])),
        spacing=height * style["spacing_pct"] / 100,
        marginl=round(width * style["margin_x_pct"] / 100),
        marginr=round(width * style["margin_x_pct"] / 100),
        marginv=round(height * style["margin_y_pct"] / 100),
    )
