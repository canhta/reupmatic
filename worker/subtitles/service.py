import uuid

from media.editing.filters import geometry_filters
from media.editing.recipe import parse_editing
from media.probe import probe_file
from runtime.errors import WorkerError
from runtime.protocol import MAX_LINE, exact

from subtitles.document import canvas_size, cue_document, srt_text, subtitle_library
from subtitles.validation import validate_cues


def load_subtitles(host, req):
    p = exact(req["params"], {"asset_id"})
    asset = host.assets.verify(p["asset_id"], "subtitle", lambda: host.cancelled(req))
    if asset["signature"][0] > MAX_LINE:
        raise WorkerError("PAYLOAD_TOO_LARGE")
    kind = asset["path"].suffix.lower().lstrip(".")
    if kind not in ("srt", "ass"):
        raise WorkerError("FORMAT_UNAVAILABLE")
    subs = subtitle_library().load(str(asset["path"]), encoding="utf-8-sig", format_=kind)
    cues = [
        {"id": str(uuid.uuid4()), "start_ms": cue.start, "end_ms": cue.end, "text": cue.plaintext}
        for cue in subs
        if not cue.is_comment
    ]
    validate_cues(cues)
    host.assets.verify(p["asset_id"], "subtitle", lambda: host.cancelled(req))
    return {"cues": cues}


def preview_subtitles(host, req):
    p = exact(req["params"], {"cues"}, {"style", "canvas"})
    return {"ass_text": cue_document(p["cues"], p.get("style"), p.get("canvas")).to_string("ass")}


def save_subtitles(host, req):
    p = exact(req["params"], {"cues"}, {"format", "style", "canvas"})
    kind = p.get("format", "srt")
    if kind not in ("srt", "ass"):
        raise WorkerError("FORMAT_UNAVAILABLE")
    subs = cue_document(p["cues"], p.get("style"), p.get("canvas"), styled=kind == "ass")
    target = host.workspace / "subtitles" / f"{uuid.uuid4()}.{kind}"
    target.parent.mkdir(exist_ok=True)
    if kind == "srt":
        target.write_text(srt_text(p["cues"]), encoding="utf-8")
    else:
        subs.save(str(target), encoding="utf-8", format_=kind)
    registered = host.assets.register({**req, "params": {"path": str(target), "kind": "subtitle"}})
    return {
        **registered,
        "path": str(target),
        "ass_text": cue_document(p["cues"], p.get("style"), p.get("canvas")).to_string("ass"),
    }


def prepare_subtitles(host, req):
    p = exact(req["params"], {"asset_id", "cues"}, {"editing", "style", "canvas"})
    source = host.assets.verify(p["asset_id"], "video", lambda: host.cancelled(req))
    info = probe_file(host, req, source["path"])
    if "canvas" in p:
        info["width"], info["height"] = canvas_size(p["canvas"])
    edit = parse_editing(p["editing"]) if "editing" in p else {}
    _, (width, height) = geometry_filters(edit, info)
    result = save_subtitles(
        host,
        {
            **req,
            "params": {
                "cues": p["cues"],
                "format": "ass",
                "canvas": {"width": width, "height": height},
                **({"style": p["style"]} if "style" in p else {}),
            },
        },
    )
    host.assets.verify(p["asset_id"], "video", lambda: host.cancelled(req))
    return result
