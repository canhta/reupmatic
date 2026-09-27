"""Refine OCR cue boundaries to the exact decoded frame.

Sampling puts every cue edge on the sample grid, so a cue can start or end up to one sample late.
Between the two samples that straddle a change, decode the interval at the source frame rate and
compare the subtitle region — the union of the detected text boxes, padded — frame by frame. The
frame where that region changes is the true boundary. When the pixels cannot decide, the
OCR-derived sample time is kept, so OCR is the tie-break, never the ruler.
"""

from __future__ import annotations

import json
from typing import Any

from vision.merge import summarize

# The union of a cue's text boxes is padded before comparison so anti-aliased edges count.
REGION_PADDING_PX = 6
# Mean absolute RGB difference over the region, normalized to [0, 1]. Text on/off is a large step;
# compression noise between two identical frames stays far below it.
REGION_DIFF_MIN = 0.03
MAX_REFINE_FPS = 120


def region_of(
    box: tuple[int, int, int, int] | None,
    padding: int,
    width: int,
    height: int,
) -> tuple[int, int, int, int] | None:
    if box is None:
        return None
    x0 = max(0, box[0] - padding)
    y0 = max(0, box[1] - padding)
    x1 = min(width, box[2] + padding)
    y1 = min(height, box[3] + padding)
    if x1 - x0 < 1 or y1 - y0 < 1:
        return None
    return x0, y0, x1, y1


def normalized_difference(left: Any, right: Any) -> float:
    import numpy as np

    return float(np.abs(left.astype(np.int16) - right.astype(np.int16)).mean()) / 255


def change_index(frames: list[Any], threshold: float = REGION_DIFF_MIN) -> int | None:
    """Index of the frame after the strongest region change, or None when nothing changes."""
    best: int | None = None
    best_diff = threshold
    for index in range(1, len(frames)):
        difference = normalized_difference(frames[index - 1], frames[index])
        if difference > best_diff:
            best_diff = difference
            best = index
    return best


def refine_boundaries(group: Any, sampler: Any, width: int, height: int) -> tuple[int, int]:
    """Refine one merged cue's edges with a sampler(start_ms, end_ms, region) -> [(time, frame)]."""
    start_ms, end_ms = group.start_ms, group.end_ms
    if group.prev is not None:
        region = region_of(summarize(group.first)[2], REGION_PADDING_PX, width, height)
        if region is not None:
            frames = sampler(group.prev["start_ms"], group.first["start_ms"], region)
            index = change_index([frame for _, frame in frames])
            if index is not None:
                start_ms = frames[index][0]
    if group.next is not None:
        region = region_of(summarize(group.last)[2], REGION_PADDING_PX, width, height)
        if region is not None:
            frames = sampler(group.last["start_ms"], group.next["start_ms"], region)
            index = change_index([frame for _, frame in frames])
            if index is not None:
                end_ms = frames[index][0]
    return start_ms, end_ms


def _source_fps(host, req, source_path) -> float:
    info = json.loads(
        host.process.run(
            req,
            [
                host.ffprobe,
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=r_frame_rate",
                "-of",
                "json",
                str(source_path),
            ],
            timeout=30,
        )
    )
    rate = info["streams"][0]["r_frame_rate"]
    numerator, _, denominator = rate.partition("/")
    fps = float(numerator) / float(denominator or 1)
    if not 1 <= fps <= MAX_REFINE_FPS:
        fps = min(MAX_REFINE_FPS, max(1.0, fps))
    return fps


def frame_sampler(host, req, source_path, width: int, height: int, fps: float, stats: dict):
    import numpy as np

    def sample(start_ms: int, end_ms: int, region: tuple[int, int, int, int]):
        import tempfile
        from pathlib import Path

        x0, y0, x1, y1 = region
        frame_width, frame_height = x1 - x0, y1 - y0
        duration = max(0.001, (end_ms - start_ms) / 1000)
        # Decode one extra frame past the sample so the end transition frame itself is present.
        with tempfile.TemporaryDirectory(dir=host.workspace, prefix="refine-") as directory:
            target = Path(directory) / "region.rgb"
            host.process.run(
                req,
                [
                    host.ffmpeg,
                    "-v",
                    "error",
                    "-nostdin",
                    "-ss",
                    str(start_ms / 1000),
                    "-i",
                    str(source_path),
                    "-t",
                    str(duration + 1.0 / fps),
                    "-map",
                    "0:v:0",
                    "-an",
                    "-sn",
                    "-vf",
                    f"fps={fps},scale={width}:{height},crop={frame_width}:{frame_height}:{x0}:{y0}",
                    "-frames:v",
                    str(int(duration * fps) + 2),
                    "-pix_fmt",
                    "rgb24",
                    "-f",
                    "rawvideo",
                    "-n",
                    str(target),
                ],
                timeout=120,
            )
            raw = target.read_bytes()
        frame_size = frame_width * frame_height * 3
        count = len(raw) // frame_size
        stats["frames"] += count
        step = 1000 / fps
        return [
            (
                round(start_ms + index * step),
                np.frombuffer(
                    raw[index * frame_size : (index + 1) * frame_size], dtype=np.uint8
                ).reshape(frame_height, frame_width, 3),
            )
            for index in range(count)
        ]

    return sample


def refine_groups(host, req, source_path, width: int, height: int, groups: list[Any]) -> dict:
    """Refine every internal cue edge; return decode statistics for the caller to report."""
    import time

    started = time.monotonic()
    fps = _source_fps(host, req, source_path)
    stats = {"frames": 0}
    sampler = frame_sampler(host, req, source_path, width, height, fps, stats)
    refined = 0
    for group in groups:
        before = (group.start_ms, group.end_ms)
        start_ms, end_ms = refine_boundaries(group, sampler, width, height)
        if start_ms < end_ms:
            group.start_ms, group.end_ms = start_ms, end_ms
        if (group.start_ms, group.end_ms) != before:
            refined += 1
    return {
        "fps": fps,
        "refined": refined,
        "decoded_frames": stats["frames"],
        "elapsed_ms": round((time.monotonic() - started) * 1000),
    }
