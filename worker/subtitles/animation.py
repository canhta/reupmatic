"""ASS override tags for the animation presets, in one place.

Every generated tag is placed around escaped text, never inside it. The live overlay renders this
same document, so a preset looks the same live and in the export.
"""

from subtitles.style import parse_style
from subtitles.word_timing import cue_words

# Instant style switches need a real duration; equal-time `\t` never animates in libass.
SWITCH_MS = 40
# Active-word pop: a short transient, not a hold. Peak, rise and fall are named and eased.
POP_PEAK_PERCENT = 115
POP_RISE_MS = 80
POP_FALL_MS = 120
POP_EASE = 0.5
# Mirrors the core layout constants so libass never re-wraps an explicitly broken line.
LATIN_ADVANCE_EM = 0.5
CJK_ADVANCE_EM = 1.0
BOLD_ADVANCE_FACTOR = 1.05
WRAP_MAX_LINES = 2


def literal_ass(text):
    # Break user-authored escape sequences; only our newlines become ASS tags.
    return (
        text.replace("\\", "\\\u2060")
        .replace("{", r"\{")
        .replace("}", r"\}")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\n", r"\N")
    )


def _ass_color(hex_value):
    red, green, blue = hex_value[1:3], hex_value[3:5], hex_value[5:7]
    return f"&H{blue}{green}{red}&".upper()


def _anchor(style, width, height):
    """The alignment point `\\move` uses, from the style's alignment and margins."""
    position = int(style["position"])
    margin_x = round(width * style["margin_x_pct"] / 100)
    margin_y = round(height * style["margin_y_pct"] / 100)
    column = (position - 1) % 3
    row = (position - 1) // 3
    x = margin_x if column == 0 else width - margin_x if column == 2 else round(width / 2)
    y = margin_y if row == 2 else round(height / 2) if row == 1 else height - margin_y
    return x, y


def _fade_ms(animation, cue_duration):
    fade_in = 0
    fade_out = 0
    if animation["in"]["preset"] == "fade":
        fade_in = min(animation["in"]["duration_ms"], cue_duration)
    if animation["out"]["preset"] == "fade":
        fade_out = min(animation["out"]["duration_ms"], cue_duration)
    return fade_in, fade_out


def _in_tags(animation, cue_duration, style, width, height):
    preset = animation["in"]["preset"]
    duration = min(animation["in"]["duration_ms"], cue_duration)
    if preset == "none" or duration <= 0:
        return ""
    if preset == "pop":
        overshoot = round(duration * 0.6)
        return (
            f"{{\\fscx0\\fscy0\\t(0,{overshoot},\\fscx110\\fscy110)"
            f"\\t({overshoot},{duration},\\fscx100\\fscy100)}}"
        )
    if preset in ("slide-up", "slide-left"):
        x, y = _anchor(style, width, height)
        if preset == "slide-up":
            x1, y1 = x, y + round(height * 0.05)
        else:
            x1, y1 = x - round(width * 0.05), y
        return f"{{\\move({x1},{y1},{x},{y},0,{duration})}}"
    if preset == "blur":
        blur = max(1, round(height * 0.02))
        return f"{{\\blur{blur}\\t(0,{duration},\\blur0)}}"
    return ""


def _out_tags(animation, cue_duration, style, width, height):
    preset = animation["out"]["preset"]
    duration = min(animation["out"]["duration_ms"], cue_duration)
    if preset == "none" or duration <= 0:
        return ""
    start = max(0, cue_duration - duration)
    if preset == "pop-out":
        return f"{{\\t({start},{cue_duration},\\fscx0\\fscy0)}}"
    if preset == "slide-down":
        x, y = _anchor(style, width, height)
        return f"{{\\move({x},{y},{x},{y + round(height * 0.05)},{start},{cue_duration})}}"
    return ""


def _emphasis_tags(preset, word, cue_start, cue_duration, accent, text_color):
    start = max(0, word["start_ms"] - cue_start)
    end = max(start, word["end_ms"] - cue_start)
    if preset == "karaoke":
        return f"{{\\kf{max(1, round((end - start) / 10))}}}"
    if preset == "color":
        # Base at rest; accent only between this word's start and end.
        return (
            f"{{\\c{_ass_color(text_color)}"
            f"\\t({start},{min(cue_duration, start + SWITCH_MS)},\\c{_ass_color(accent)})"
            f"\\t({end},{min(cue_duration, end + SWITCH_MS)},\\c{_ass_color(text_color)})}}"
        )
    if preset == "pop":
        peak = start + POP_RISE_MS
        settle = peak + POP_FALL_MS
        return (
            f"{{\\t({start},{peak},{POP_EASE},"
            f"\\fscx{POP_PEAK_PERCENT}\\fscy{POP_PEAK_PERCENT})"
            f"\\t({peak},{settle},{POP_EASE},\\fscx100\\fscy100)}}"
        )
    if preset == "appear":
        return f"{{\\alpha&HFF&\\t({start},{min(cue_duration, start + SWITCH_MS)},\\alpha&H00&)}}"
    if preset == "one-at-a-time":
        return (
            f"{{\\alpha&HFF&\\t({start},{min(cue_duration, start + SWITCH_MS)},\\alpha&H00&)"
            f"\\t({end},{min(cue_duration, end + SWITCH_MS)},\\alpha&HFF&)}}"
        )
    return ""


def _is_cjk(character):
    return "\u2e80" <= character <= "\u9fff" or "\uf900" <= character <= "\ufaff"


def _per_line(style, width, height, cjk):
    em = height * style["font_size_pct"] / 100
    advance = (
        em
        * (CJK_ADVANCE_EM if cjk else LATIN_ADVANCE_EM)
        * (BOLD_ADVANCE_FACTOR if style["bold"] else 1)
    )
    usable = width * (1 - 2 * style["margin_x_pct"] / 100)
    return max(1, int(usable / advance + 1e-9))


def _is_cjk_text(text):
    cjk = sum(1 for character in text if _is_cjk(character))
    other = sum(1 for character in text if not character.isspace() and not _is_cjk(character))
    return cjk > other


def _wrap_text(text, per_line):
    tokens = text.split(" ")
    lines = []
    current = []
    count = 0
    for token in tokens:
        width = len(token)
        if current and count + width + 1 > per_line:
            lines.append(" ".join(current))
            current = []
            count = 0
        current.append(token)
        count += width + (1 if len(current) > 1 else 0)
    if current:
        lines.append(" ".join(current))
    return "\n".join(lines)


def _wrap_words(words, per_line):
    lines = []
    current = []
    count = 0
    for word in words:
        width = sum(1 for character in word["text"] if not character.isspace())
        if current and count + width + 1 > per_line:
            lines.append(current)
            current = []
            count = 0
        current.append(word)
        count += width + (1 if len(current) > 1 else 0)
    if current:
        lines.append(current)
    wrapped = []
    for index, line in enumerate(lines):
        for position, word in enumerate(line):
            text = word["text"]
            if position == len(line) - 1 and index < len(lines) - 1:
                text = text.rstrip() + "\n"
            wrapped.append({**word, "text": text})
    return wrapped


def _body(cue, style, animation, width, height):
    cue_start = cue["start_ms"]
    cue_duration = cue["end_ms"] - cue_start
    text = cue["text"].upper() if style["uppercase"] else cue["text"]
    per_line = _per_line(style, width, height, _is_cjk_text(text))
    emphasis = animation["emphasis"]["preset"]
    if emphasis != "none":
        accent = style["accent_color"]
        text_color = style["text_color"]
        line = ""
        if emphasis == "karaoke":
            # Sung words fill to the accent, the rest stay in the text colour.
            line = f"{{\\1c{_ass_color(accent)}\\2c{_ass_color(text_color)}}}"
        words = _wrap_words(cue_words(cue), per_line)
        for word in words:
            word_text = word["text"].upper() if style["uppercase"] else word["text"]
            line += _emphasis_tags(
                emphasis, word, cue_start, cue_duration, accent, text_color
            ) + literal_ass(word_text)
        return line
    wrapped = _wrap_text(text, per_line)
    if animation["in"]["preset"] == "typewriter":
        duration = min(animation["in"]["duration_ms"], cue_duration)
        characters = list(wrapped)
        if duration > 0 and characters:
            step = duration / len(characters)
            return "".join(
                f"{{\\alpha&HFF&\\t({round(index * step)},{round(index * step + step)},\\alpha&H00&)}}"
                + literal_ass(character)
                for index, character in enumerate(characters)
            )
    return literal_ass(wrapped)


def event_text(cue, style, width, height):
    """One ASS event's text: escaped cue text wrapped in the style's animation tags."""
    value = parse_style(style)
    animation = value["animation"]
    cue_duration = cue["end_ms"] - cue["start_ms"]
    fade_in, fade_out = _fade_ms(animation, cue_duration)
    tags = ""
    if fade_in or fade_out:
        tags += f"{{\\fad({fade_in},{fade_out})}}"
    tags += _in_tags(animation, cue_duration, value, width, height)
    tags += _out_tags(animation, cue_duration, value, width, height)
    return tags + _body(cue, value, animation, width, height)
