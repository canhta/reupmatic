"""The one bundled font set; mirrors app/core/subtitles/fonts.ts.

The Python and TypeScript lists are kept equal by a contract test, and every file here must exist
in the app-owned `fonts/` directory. libass must never fall back to a system font, so a burn with a
missing directory or file is a hard failure, not a quiet substitution.
"""

from pathlib import Path

from runtime.errors import WorkerError

BUNDLED_FONTS: dict[str, tuple[str, ...]] = {
    "Be Vietnam Pro": ("BeVietnamPro-Regular.ttf", "BeVietnamPro-Bold.ttf"),
}
FONT_FAMILIES: tuple[str, ...] = tuple(BUNDLED_FONTS)


def require_fonts_dir(directory) -> Path:
    """Return the bundled fonts directory, or fail loudly when it cannot serve the font."""
    path = Path(directory) if directory else None
    if path is None or not path.is_dir():
        raise WorkerError("SUBTITLE_FONT_MISSING")
    if any(not (path / name).is_file() for files in BUNDLED_FONTS.values() for name in files):
        raise WorkerError("SUBTITLE_FONT_MISSING")
    return path
