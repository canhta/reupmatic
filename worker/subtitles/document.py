import re
import uuid

from runtime.errors import WorkerError
from runtime.protocol import bounded_int, exact
from subtitles.style import DEFAULT_STYLE, ass_style
from subtitles.validation import validate_cues


def subtitle_library():
    try:
        import pysubs2
        return pysubs2
    except ImportError:
        raise WorkerError("COMPONENT_MISSING") from None


def canvas_size(value=None):
    if value is None:
        return 1920, 1080
    value = exact(value, {"width", "height"})
    return bounded_int(value["width"], 2, 16384), bounded_int(value["height"], 2, 16384)


def literal_ass(text):
    # Break user-authored escape sequences; only our newlines become ASS tags.
    return (text.replace("\\", "\\\u2060").replace("{", r"\{").replace("}", r"\}")
            .replace("\r\n", "\n").replace("\r", "\n").replace("\n", r"\N"))


def cue_document(cues, style=None, canvas=None, styled=True):
    validate_cues(cues)
    lib = subtitle_library()
    subs = lib.SSAFile()
    width, height = canvas_size(canvas)
    subs.info.update({"PlayResX": str(width), "PlayResY": str(height),
                      "ScaledBorderAndShadow": "yes", "WrapStyle": "0"})
    subs.styles["Default"] = ass_style(lib, DEFAULT_STYLE if style is None else style, width, height)
    for index, cue in enumerate(cues):
        name = "Default"
        if styled and "style" in cue:
            name = f"Cue{index}"
            subs.styles[name] = ass_style(lib, cue["style"], width, height)
        event = lib.SSAEvent(start=cue["start_ms"], end=cue["end_ms"], style=name)
        if styled:
            event.text = literal_ass(cue["text"])
        else:
            event.plaintext = cue["text"]
        subs.append(event)
    return subs


def style_srt(source, output, style, dimensions):
    lib = subtitle_library()
    loaded = lib.load(str(source), encoding="utf-8-sig", format_="srt")
    cues = [{"id": str(index), "start_ms": cue.start, "end_ms": cue.end, "text": cue.plaintext}
            for index, cue in enumerate(loaded) if not cue.is_comment]
    document = cue_document(cues, style, {"width": dimensions[0], "height": dimensions[1]})
    document.save(str(output), encoding="utf-8", format_="ass")


def srt_text(cues):
    validate_cues(cues)
    lib = subtitle_library()
    token = str(uuid.uuid4())
    while any(token in cue["text"] for cue in cues):
        token = str(uuid.uuid4())
    subs = lib.SSAFile()
    replacements = {}
    for index, cue in enumerate(cues):
        marker = f"__{token}_{index}__"
        replacements[marker] = cue["text"].replace("\r\n", "\n").replace("\r", "\n")
        subs.append(lib.SSAEvent(start=cue["start_ms"], end=cue["end_ms"], text=marker))
    text = subs.to_string("srt", apply_styles=False)
    # Preserve literal braces/backslashes; the library's SRT writer otherwise interprets ASS tags.
    marker_pattern = re.compile(r"__" + re.escape(token) + r"_\d+__")
    return marker_pattern.sub(lambda match: replacements[match[0]], text)
