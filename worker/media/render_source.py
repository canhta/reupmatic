"""Resolve a single video or a bounded montage into the same final encoding path."""

from pathlib import Path

from runtime.errors import WorkerError

from media.composition.assembly import assemble, verify_sources
from media.composition.document import parse_composition
from media.editing.recipe import resolve_window
from media.probe import probe_file


def resolve_render_source(host, req, params, editing=None):
    source = host.assets.verify(params["asset_id"], "video", lambda: host.cancelled(req))
    document, spans = None, None
    if "composition" in params:
        document, spans, duration = parse_composition(params["composition"])
        if any(key in params.get("processing", {}) for key in ("ocr", "inpaint")):
            raise WorkerError("COMPOSITION_PROCESSING_UNAVAILABLE")
        info = {
            "duration_ms": duration,
            "width": document["canvas"]["width"],
            "height": document["canvas"]["height"],
            "frame_rate": "30",
            "has_audio": True,
        }
    else:
        info = probe_file(host, req, source["path"])
        duration = info["duration_ms"]
    window = resolve_window(editing, duration)
    offset = 0
    if document:
        assembled = assemble(host, req, document, spans, window)
        source = {"path": Path(assembled["path"]), "sha256": assembled["sha256"]}
        offset = window["start_ms"]
    return source, info, window, offset


def verify_render_sources(host, req):
    host.assets.verify(req["params"]["asset_id"], "video", lambda: host.cancelled(req))
    if "composition" in req["params"]:
        document, _, _ = parse_composition(req["params"]["composition"])
        verify_sources(host, req, document)
