from pathlib import Path

from runtime.context import WorkerContext
from runtime.errors import WorkerError
from runtime.protocol import exact

from media.probe import probe_file

# A cover is a Library row's thumbnail, not a preview: it is rendered small (UI-CM06) and one of
# these exists per item, so the long edge is bounded rather than kept at source resolution.
MAX_EDGE = 640


def poster(host: WorkerContext, req: dict) -> dict:
    """Extracts one still frame as a Library item's cover.

    A local import has no cover of its own — only connector items arrive with one — so without
    this half the Library renders blank cells. The frame is taken a little way in because the
    first frame of a video is very often black or a fade-in, which makes for a useless thumbnail.
    """
    p = exact(req["params"], {"asset_id", "output_path"})
    asset = host.assets.get(p["asset_id"], "video")
    output = Path(p["output_path"])
    if not output.is_absolute():
        raise WorkerError("PATH_NOT_ABSOLUTE")
    if output.exists():
        raise WorkerError("OUTPUT_UNSAFE")
    output.parent.mkdir(parents=True, exist_ok=True)

    info = probe_file(host, req, asset["path"])
    # One second in, unless the clip is shorter than that, in which case take the midpoint.
    duration_ms = info["duration_ms"]
    seek_ms = 1000 if duration_ms > 2000 else duration_ms // 2

    host.process.run(
        req,
        [
            host.ffmpeg,
            "-v",
            "error",
            "-nostdin",
            "-ss",
            f"{seek_ms / 1000:.3f}",
            "-i",
            str(asset["path"]),
            "-frames:v",
            "1",
            "-vf",
            f"scale='min({MAX_EDGE},iw)':-2",
            "-f",
            "image2",
            "-n",
            str(output),
        ],
        timeout=60,
    )
    if not output.is_file() or output.stat().st_size == 0:
        raise WorkerError("POSTER_FAILED")
    return {"cover_path": str(output), "width": info["width"], "height": info["height"]}
