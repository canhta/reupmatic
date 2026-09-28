import math

from runtime.errors import WorkerError
from vision.service import DISK_RESERVE, MAX_OCR_EDGE, MAX_SEGMENT_BYTES


def intervals(start, end, window):
    while start < end:
        stop = min(end, start + window)
        yield start, stop
        start = stop


def ocr_window(sample_ms):
    max_frames = (MAX_SEGMENT_BYTES - DISK_RESERVE) // (MAX_OCR_EDGE**2 * 3)
    return min(max_frames, 120000 // sample_ms) * sample_ms


def verify_segment_models(result, expected, options, method):
    actual = result.get("model_fingerprints", {})
    needed = {"ocr": expected["ocr_" + options["language"]]}
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
        completed = (start - overall_start + (end - start) * last_fraction * 0.9) / (
            overall_end - overall_start
        )
        host.emit(req, "progress", {"phase": phase, "fraction": completed})

    return emit
