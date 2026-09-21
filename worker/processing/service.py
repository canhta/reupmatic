import shutil
import tempfile
from pathlib import Path

from media.audio.soundtrack import fingerprint, resolve_soundtrack, verify_soundtrack
from media.audio.voice import fingerprint as voice_fingerprint
from media.audio.voice import resolve_voice, verify_voice
from media.cache import RenderCache
from media.encoding import encode_video
from media.probe import probe_file
from media.render_source import resolve_render_source, verify_render_sources
from runtime.errors import WorkerError
from runtime.protocol import exact
from subtitles.service import subtitle_library

from processing.chunks import remove_text
from processing.ocr_scan import scan_subtitles
from processing.recipe import parse_fingerprints, parse_recipe, resolve_models


def process_video(host, req):
    p = exact(
        req["params"],
        {"asset_id", "mode", "encoding", "processing"},
        {
            "subtitle_id",
            "start_ms",
            "end_ms",
            "model_fingerprints",
            "soundtrack",
            "voice",
            "composition",
            "logo",
        },
    )
    if p["mode"] not in ("sample", "full") or p["encoding"] != "review":
        raise WorkerError("INVALID_PROCESSING")
    processing = parse_recipe(p["processing"], "subtitle_id" in p)
    if "ocr" in processing:
        subtitle_library()

    def check():
        return host.cancelled(req)

    source, info, window, source_offset, output_sample, full_output_ms = resolve_render_source(
        host, req, p, processing.get("editing")
    )
    subtitle = (
        host.assets.verify(p["subtitle_id"], "subtitle", check) if "subtitle_id" in p else None
    )
    soundtrack = resolve_soundtrack(host, req, p.get("soundtrack"))
    voice = resolve_voice(host, req, p.get("voice"))
    logo = resolve_logo(host, req, p.get("logo"), processing.get("editing"))
    start, end = window["start_ms"], window["end_ms"]
    host.emit(req, "progress", {"phase": "processingModels", "fraction": None})
    fingerprints = resolve_models(host, req, processing)
    if (
        "model_fingerprints" in p
        and parse_fingerprints(p["model_fingerprints"], processing) != fingerprints
    ):
        raise WorkerError("PROCESSING_MODELS_CHANGED")
    recipe = {
        "schema": 1,
        "renderer": "local-processing-0.12.0",
        "processing": processing,
        "models": fingerprints,
        "soundtrack": fingerprint(soundtrack),
        "voice": voice_fingerprint(voice),
        "logo": logo["sha256"] if logo else None,
        "source": source["sha256"],
        "subtitle": subtitle["sha256"] if subtitle else None,
        "start_ms": start,
        "end_ms": end,
        "source_offset_ms": source_offset,
        "sample": list(output_sample) if output_sample else None,
        "encoding": "review",
        "runtime": host.runtime_identity,
    }
    cache = RenderCache(host, recipe, ".mp4")
    cached = cache.read(req)
    if cached:
        verify_inputs(host, req, processing, fingerprints, subtitle, logo)
        verify_soundtrack(host, req, soundtrack)
        verify_voice(host, req, voice)
        return cached
    with tempfile.TemporaryDirectory(dir=host.workspace, prefix="processing-") as directory:
        staging = Path(directory)
        track = subtitle["path"] if subtitle else None
        cue_count = None
        if "ocr" in processing:
            track, cue_count = scan_subtitles(
                host, req, processing["ocr"], start, end, staging, fingerprints
            )
        video_track = None
        frame_count = None
        if "inpaint" in processing:
            video_track, frame_count = remove_text(
                host, req, processing["inpaint"], start, end, staging, fingerprints
            )
        required = (
            video_track.stat().st_size if video_track else source["path"].stat().st_size
        ) + 64 * 1024**2
        if shutil.disk_usage(staging).free < required:
            raise WorkerError("VISION_DISK_LOW")
        output = staging / "output.mp4"
        host.emit(req, "progress", {"phase": "processingEncoding", "fraction": None})
        encode_video(
            host,
            req,
            source["path"],
            output,
            start_ms=start,
            end_ms=end,
            encoding="review",
            subtitle=track,
            video_track=video_track,
            editing=processing.get("editing"),
            soundtrack=soundtrack,
            voice=voice,
            logo=logo["path"] if logo else None,
            subtitle_style=processing.get("subtitle_style"),
            source_offset_ms=source_offset,
            apply_fades=p["mode"] == "full" or output_sample is not None,
            sample=output_sample,
            full_output_ms=full_output_ms,
        )
        media = probe_file(host, req, output)
        expected_audio = (
            bool(soundtrack)
            or bool(voice)
            or (
                info["has_audio"]
                and not processing.get("editing", {}).get("audio", {}).get("muted", False)
            )
        )
        output_duration_ms = (
            output_sample[1] - output_sample[0] if output_sample else window["duration_ms"]
        )
        if (
            abs(media["duration_ms"] - output_duration_ms) > 200
            or media["has_audio"] != expected_audio
        ):
            raise WorkerError("OUTPUT_DURATION")
        host.emit(req, "progress", {"phase": "processingVerifying", "fraction": None})
        verify_inputs(host, req, processing, fingerprints, subtitle, logo)
        details = {
            "recipe": processing,
            "model_fingerprints": fingerprints,
            "ocr_cue_count": cue_count,
            "inpaint_frame_count": frame_count,
            "edit_window": window,
        }
        verify_soundtrack(host, req, soundtrack)
        verify_voice(host, req, voice)
        return cache.publish(req, output, media, details)


def resolve_logo(host, req, value, editing):
    if value is None:
        return None
    if not editing or "logo" not in editing:
        raise WorkerError("INVALID_REQUEST")
    asset = host.assets.verify(value["asset_id"], "image", lambda: host.cancelled(req))
    if asset["sha256"] != value["sha256"]:
        raise WorkerError("SOURCE_CHANGED")
    return asset


def verify_inputs(host, req, processing, fingerprints, subtitle, logo=None):
    def check():
        return host.cancelled(req)

    verify_render_sources(host, req)
    if subtitle:
        host.assets.verify(req["params"]["subtitle_id"], "subtitle", check)
    if logo:
        host.assets.verify(req["params"]["logo"]["asset_id"], "image", check)
    if resolve_models(host, req, processing) != fingerprints:
        raise WorkerError("PROCESSING_MODELS_CHANGED")
