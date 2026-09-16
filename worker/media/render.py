import tempfile
from pathlib import Path

from runtime.context import WorkerContext
from runtime.errors import WorkerError
from runtime.protocol import exact

from media.audio.soundtrack import fingerprint, resolve_soundtrack, verify_soundtrack
from media.cache import RenderCache
from media.encoding import encode_video
from media.probe import probe_file
from media.render_source import resolve_render_source, verify_render_sources


def render(host: WorkerContext, req: dict) -> dict:
    p = exact(
        req["params"],
        {"asset_id", "mode", "encoding"},
        {"subtitle_id", "start_ms", "end_ms", "soundtrack", "composition"},
    )
    if p["mode"] not in {"sample", "full"} or p["encoding"] not in {"review", "lossless"}:
        raise WorkerError("INVALID_REQUEST")

    def check():
        return host.cancelled(req)

    source, info, window, source_offset = resolve_render_source(host, req, p)
    subtitle = (
        host.assets.verify(p["subtitle_id"], "subtitle", check) if p.get("subtitle_id") else None
    )
    soundtrack = resolve_soundtrack(host, req, p.get("soundtrack"))
    start, end = window["start_ms"], window["end_ms"]
    recipe = {
        "schema": 1,
        "renderer": "ffmpeg-media-0.12.0",
        "source": source["sha256"],
        "subtitle": subtitle["sha256"] if subtitle else None,
        "soundtrack": fingerprint(soundtrack),
        "start_ms": start,
        "end_ms": end,
        "source_offset_ms": source_offset,
        "encoding": p["encoding"],
        "runtime": host.runtime_identity,
    }
    cache = RenderCache(host, recipe, ".mp4" if p["encoding"] == "review" else ".mkv")
    cached = cache.read(req)
    if cached:
        verify_render_sources(host, req)
        if subtitle:
            host.assets.verify(p["subtitle_id"], "subtitle", check)
        verify_soundtrack(host, req, soundtrack)
        return cached
    with tempfile.TemporaryDirectory(dir=host.workspace, prefix="render-") as tmp:
        partial = Path(tmp) / cache.output.name
        host.emit(req, "progress", {"phase": "rendering", "fraction": None})
        encode_video(
            host,
            req,
            source["path"],
            partial,
            start_ms=start,
            end_ms=end,
            encoding=p["encoding"],
            subtitle=subtitle["path"] if subtitle else None,
            soundtrack=soundtrack,
            source_offset_ms=source_offset,
        )
        media = probe_file(host, req, partial)
        if abs(media["duration_ms"] - (end - start)) > 200:
            raise WorkerError("OUTPUT_DURATION")
        verify_render_sources(host, req)
        if subtitle:
            host.assets.verify(p["subtitle_id"], "subtitle", check)
        verify_soundtrack(host, req, soundtrack)
        return cache.publish(req, partial, media)
