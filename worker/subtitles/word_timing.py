"""Render-time word timings for cues without measured ones.

Estimated timings drive word-level animation only; they are never written back as measured.
Language is not passed in: Latin text splits on spaces, CJK splits per character.
"""

_CJK_RANGES = (
    (0x2E80, 0x2FFF),  # radicals and Kangxi symbols
    (0x3040, 0x30FF),  # kana
    (0x3400, 0x4DBF),  # CJK extension A
    (0x4E00, 0x9FFF),  # CJK unified ideographs
    (0xF900, 0xFAFF),  # compatibility ideographs
    (0x20000, 0x2FA1F),  # extensions B and beyond
)


def _is_cjk(character: str) -> bool:
    code = ord(character)
    return any(low <= code <= high for low, high in _CJK_RANGES)


def _units(text: str) -> list[str]:
    """Split into words that concatenate back to `text`, so they satisfy cue validation."""
    units: list[str] = []
    buffer = ""
    pending = ""
    for character in text:
        if character.isspace():
            if buffer:
                units.append(buffer)
                buffer = ""
            if units:
                units[-1] += character
            else:
                pending += character
        elif _is_cjk(character):
            if buffer:
                units.append(buffer)
                buffer = ""
            units.append(pending + character)
            pending = ""
        else:
            if pending:
                buffer += pending
                pending = ""
            buffer += character
    if buffer:
        units.append(buffer)
    if pending:
        if units:
            units[-1] += pending
        else:
            units.append(pending)
    return [unit for unit in units if unit.strip()]


def _weight(unit: str) -> int:
    return sum(1 for character in unit if not character.isspace())


def _allocate(units: list[str], duration_ms: int) -> list[int]:
    """Every word gets at least one millisecond; the rest is shared by character weight."""
    remaining = duration_ms - len(units)
    total = sum(_weight(unit) for unit in units)
    lengths: list[int] = []
    distributed = 0
    for index, unit in enumerate(units):
        if index == len(units) - 1:
            lengths.append(remaining - distributed)
        else:
            share = remaining * _weight(unit) // total if total else remaining // len(units)
            lengths.append(share)
            distributed += share
    return [length + 1 for length in lengths]


def estimate_words(text: str, start_ms: int, end_ms: int) -> list[dict]:
    """Even, character-weighted word spans inside an existing cue window."""
    if not isinstance(text, str) or not text.strip():
        return []
    if not 0 <= start_ms < end_ms:
        return []
    units = _units(text)
    duration = end_ms - start_ms
    # A cue shorter than its word count cannot give each word a millisecond; coarsen the words.
    while len(units) > duration and len(units) > 1:
        units = [units[0] + units[1], *units[2:]]
    words: list[dict] = []
    cursor = start_ms
    for unit, length in zip(units, _allocate(units, duration)):
        words.append({"text": unit, "start_ms": cursor, "end_ms": cursor + length})
        cursor += length
    return words


def cue_words(cue: dict) -> list[dict]:
    """Measured word timings when present, otherwise estimated ones."""
    if cue.get("words"):
        return cue["words"]
    return estimate_words(cue["text"], cue["start_ms"], cue["end_ms"])
