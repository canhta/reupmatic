"""ASS override tags for the animation presets, in one place.

Every generated tag is placed around escaped text, never inside it. The live overlay renders this
same document, so a preset looks the same live and in the export.
"""

import re

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


def _is_cjk_text(text):
    cjk = sum(1 for character in text if _is_cjk(character))
    other = sum(1 for character in text if not character.isspace() and not _is_cjk(character))
    return cjk > other


def _per_line(style, width, height, cjk, line_length=None):
    if line_length and line_length.get("max_chars"):
        return max(1, int(line_length["max_chars"]) // int(line_length["max_lines"]))
    em = height * style["font_size_pct"] / 100
    advance = (
        em
        * (CJK_ADVANCE_EM if cjk else LATIN_ADVANCE_EM)
        * (BOLD_ADVANCE_FACTOR if style["bold"] else 1)
    )
    usable = width * (1 - 2 * style["margin_x_pct"] / 100)
    return max(1, int(usable / advance + 1e-9))


_END_PUNCT = set(".,!?;:…") | set("。，、！？；：")
# A break may not put one of these at the start of a line.
_CLOSING_PUNCT = set(")]}»”’") | set("。，、！？；：）】》」』〕〉")


def _ends_with_punct(text):
    stripped = text.rstrip()
    return bool(stripped) and stripped[-1] in _END_PUNCT


def _starts_with_closing(text):
    return bool(text) and text[0] in _CLOSING_PUNCT


def _tokens(text):
    """Word tokens for spaced scripts, character tokens for CJK."""
    if _is_cjk_text(text):
        tokens = []
        for character in text:
            if character.isspace() and tokens:
                tokens[-1] = (tokens[-1][0], tokens[-1][1] + character)
            else:
                tokens.append((character, ""))
        return [token for token in tokens if token[0] or token[1]]
    return [(match.group(1), match.group(2)) for match in re.finditer(r"(\S+)(\s*)", text)]


def _balanced_cuts(tokens, per_line, max_lines):
    """Cuts that balance the lines' widths, cap the line count and prefer punctuation breaks."""
    count = len(tokens)
    if count == 0:
        return [(0, 0)]
    widths = [len(text) + len(separator) for text, separator in tokens]
    prefix = [0] * (count + 1)
    for index, width in enumerate(widths):
        prefix[index + 1] = prefix[index] + width

    def line_width(start, end):
        return prefix[end] - prefix[start] - len(tokens[end - 1][1])

    lines = 1
    start = 0
    for index in range(count):
        if line_width(start, index + 1) > per_line and index > start:
            lines += 1
            start = index
    limit = min(lines, max_lines, count)
    if limit <= 1:
        return [(0, count)]

    infinity = float("inf")
    cost = [[infinity] * (count + 1) for _ in range(limit + 1)]
    back = [[-1] * (count + 1) for _ in range(limit + 1)]
    cost[0][0] = 0.0
    for line in range(1, limit + 1):
        for end in range(line, count + 1):
            for begin in range(line - 1, end):
                if cost[line - 1][begin] == infinity:
                    continue
                width = line_width(begin, end)
                over = max(0.0, width - per_line)
                punctuation = 0 if (end == count or _ends_with_punct(tokens[end - 1][0])) else 1
                orphan = 1000 if (begin > 0 and _starts_with_closing(tokens[begin][0])) else 0
                candidate = (
                    cost[line - 1][begin]
                    + width * width
                    + over * over * 1000
                    + punctuation
                    + orphan
                )
                if candidate < cost[line][end]:
                    cost[line][end] = candidate
                    back[line][end] = begin
    if cost[limit][count] == infinity:
        return [(0, count)]
    cuts = []
    end = count
    for line in range(limit, 0, -1):
        begin = back[line][end]
        cuts.append((begin, end))
        end = begin
    cuts.reverse()
    return cuts


def _format_tokens(tokens, cuts):
    lines = []
    for begin, end in cuts:
        line = "".join(text + separator for text, separator in tokens[begin : end - 1])
        lines.append(line + tokens[end - 1][0])
    return "\n".join(lines)


def _wrap_text(text, per_line, max_lines):
    tokens = _tokens(text)
    return _format_tokens(tokens, _balanced_cuts(tokens, per_line, max_lines))


def _wrap_words(words, per_line, max_lines):
    tokens = [(word["text"], "") for word in words]
    cuts = _balanced_cuts(tokens, per_line, max_lines)
    if len(cuts) <= 1:
        return list(words)
    wrapped = []
    for index, (begin, end) in enumerate(cuts):
        for position in range(begin, end):
            text = words[position]["text"]
            if position == end - 1 and index < len(cuts) - 1:
                text = text.rstrip() + "\n"
            wrapped.append({**words[position], "text": text})
    return wrapped


def _body(cue, style, animation, width, height, line_length=None):
    cue_start = cue["start_ms"]
    cue_duration = cue["end_ms"] - cue_start
    text = cue["text"].upper() if style["uppercase"] else cue["text"]
    per_line = _per_line(style, width, height, _is_cjk_text(text), line_length)
    max_lines = int(line_length["max_lines"]) if line_length else WRAP_MAX_LINES
    emphasis = animation["emphasis"]["preset"]
    if emphasis != "none":
        accent = style["accent_color"]
        text_color = style["text_color"]
        line = ""
        if emphasis == "karaoke":
            # Sung words fill to the accent, the rest stay in the text colour.
            line = f"{{\\1c{_ass_color(accent)}\\2c{_ass_color(text_color)}}}"
        words = _wrap_words(cue_words(cue), per_line, max_lines)
        for word in words:
            word_text = word["text"].upper() if style["uppercase"] else word["text"]
            line += _emphasis_tags(
                emphasis, word, cue_start, cue_duration, accent, text_color
            ) + literal_ass(word_text)
        return line
    wrapped = _wrap_text(text, per_line, max_lines)
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


def event_text(cue, style, width, height, line_length=None):
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
    return tags + _body(cue, value, animation, width, height, line_length)
