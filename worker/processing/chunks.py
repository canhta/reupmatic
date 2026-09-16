import math
import shutil
from pathlib import Path

from runtime.errors import WorkerError
from vision.service import DISK_RESERVE, MAX_OCR_EDGE, MAX_SEGMENT_BYTES, VisionService


def intervals(start, end, window):
    while start < end:
        stop = min(end, start + window)
        yield start, stop
        start = stop


def ocr_window(sample_ms):
    # A square frame is the worst case after the shared longest-edge downscale.
    max_frames = (MAX_SEGMENT_BYTES - DISK_RESERVE) // (MAX_OCR_EDGE**2 * 3)
    return min(max_frames, 120000 // sample_ms) * sample_ms


def verify_segment_models(result, expected, options, method):
    actual = result.get("model_fingerprints", {})
    needed = {}
    if method == "media.ocr" or options.get("target") == "text":
        needed["ocr"] = expected["ocr_" + options["language"]]
    if method == "media.inpaint":
        needed["inpainting"] = expected["inpainting"]
    if actual != needed:
        raise WorkerError("PROCESSING_MODELS_CHANGED")


def progress_for(host, req, phase, start, end, overall_start, overall_end):
    last_fraction = 0.0

    def emit(data):
        nonlocal last_fraction
        fraction = data.get("fraction")
        if type(fraction) not in (int, float) or not math.isfinite(fraction):
            fraction = 0
        last_fraction = max(last_fraction, min(1, max(0, fraction)))
        # A segment is complete only after its output has been verified.
        completed = (start - overall_start + (end-start) * last_fraction * 0.9) / (overall_end-overall_start)
        host.emit(req, "progress", {"phase": phase, "fraction": completed})
    return emit


def remove_text(host, req, options, start, end, staging, fingerprints):
    service = VisionService(host)
    chunks = []
    total_frames = 0
    geometry = None
    for first, last in intervals(start, end, 10000):
        host.cancelled(req)
        result = service.run({**req, "method": "media.inpaint", "params": {
            **options, "asset_id": req["params"]["asset_id"], "start_ms": first, "end_ms": last}},
            staging=staging, emit_progress=progress_for(host, req, "processingInpaint", first, last, start, end))
        verify_segment_models(result, fingerprints, options, "media.inpaint")
        current = (result["width"], result["height"], result["fps"])
        if geometry is not None and geometry != current:
            raise WorkerError("VISION_FRAME_INVALID")
        geometry = current
        total_frames += result["processed_frames"]
        if last-first == 10000 and result["processed_frames"] != 240:
            raise WorkerError("VISION_FRAME_INVALID")
        chunks.append(Path(result["path"]))
        host.emit(req, "progress", {"phase": "processingInpaint", "fraction": (last-start)/(end-start)})
    if abs(total_frames * 1000 / 24 - (end-start)) > 50:
        raise WorkerError("OUTPUT_DURATION")
    total_size = sum(chunk.stat().st_size for chunk in chunks)
    if shutil.disk_usage(staging).free < total_size + 64 * 1024**2:
        raise WorkerError("VISION_DISK_LOW")
    listing = staging / "chunks.txt"
    listing.write_text("".join(f"file '{chunk.name}'\n" for chunk in chunks), encoding="utf-8")
    output = staging / "clean-video.mkv"
    host.emit(req, "progress", {"phase": "processingJoining", "fraction": None})
    host.process.run(req, [host.ffmpeg, "-v", "error", "-nostdin", "-f", "concat", "-safe", "1",
                          "-i", str(listing), "-map", "0:v:0", "-an", "-c:v", "copy", "-n", str(output)], cwd=staging)
    for chunk in chunks:
        chunk.unlink()
    return output, total_frames
