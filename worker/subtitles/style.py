import math
import re

from runtime.errors import WorkerError

DEFAULT_STYLE = {
    "font_family": "Arial",
    "font_size_pct": 4.5,
    "text_color": "#FFFFFF",
    "outline_color": "#000000",
    "outline_pct": 0.2,
    "shadow_pct": 0.1,
    "box_color": "#000000",
    "box_opacity": 0,
    "position": 2,
    "margin_x_pct": 6,
    "margin_y_pct": 5,
    "spacing_pct": 0,
    "bold": False,
    "italic": False,
}


def parse_style(value):
    if not isinstance(value, dict) or value.keys() != DEFAULT_STYLE.keys():
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    font = value["font_family"]
    if (
        not isinstance(font, str)
        or not 1 <= len(font) <= 80
        or not font.strip()
        or any(not (c.isalnum() or c in " _.-") for c in font)
        or type(value["bold"]) is not bool
        or type(value["italic"]) is not bool
    ):
        raise WorkerError("INVALID_SUBTITLE_STYLE")
    for key in ("text_color", "outline_color", "box_color"):
        if not isinstance(value[key], str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", value[key]):
            raise WorkerError("INVALID_SUBTITLE_STYLE")
    ranges = {
        "font_size_pct": (1, 15),
        "outline_pct": (0, 2),
        "shadow_pct": (0, 2),
        "box_opacity": (0, 1),
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
        **{key: value[key].upper() for key in ("text_color", "outline_color", "box_color")},
    }


def ass_style(lib, value, width, height):
    style = parse_style(value)

    def color(hex_value, opacity=1):
        return lib.Color(
            *(int(hex_value[n : n + 2], 16) for n in (1, 3, 5)), round(255 * (1 - opacity))
        )

    box = style["box_opacity"] > 0
    return lib.SSAStyle(
        fontname=style["font_family"],
        fontsize=height * style["font_size_pct"] / 100,
        primarycolor=color(style["text_color"]),
        bold=style["bold"],
        italic=style["italic"],
        outlinecolor=color(style["box_color"], style["box_opacity"])
        if box
        else color(style["outline_color"]),
        backcolor=color(style["box_color"], style["box_opacity"]) if box else color("#000000"),
        borderstyle=3 if box else 1,
        outline=height * style["outline_pct"] / 100,
        shadow=0 if box else height * style["shadow_pct"] / 100,
        alignment=lib.Alignment(int(style["position"])),
        spacing=height * style["spacing_pct"] / 100,
        marginl=round(width * style["margin_x_pct"] / 100),
        marginr=round(width * style["margin_x_pct"] / 100),
        marginv=round(height * style["margin_y_pct"] / 100),
    )
