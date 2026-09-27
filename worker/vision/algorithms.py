"""Bounded timing/mask adaptation; native image work stays in OpenCV/NumPy/ORT."""

from __future__ import annotations

import math
import unicodedata
from typing import Any

from runtime.errors import WorkerError


def region(value: Any) -> dict:
    if not isinstance(value, dict) or set(value) != {"x", "y", "width", "height"}:
        raise WorkerError("INVALID_REQUEST")
    if any(type(v) not in (int, float) or not math.isfinite(v) for v in value.values()):
        raise WorkerError("INVALID_REQUEST")
    x, y, width, height = (value[k] for k in ("x", "y", "width", "height"))
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1 + 1e-9 or y + height > 1 + 1e-9:
        raise WorkerError("INVALID_REQUEST")
    return dict(value)


def pixel_rect(value: dict, width: int, height: int) -> tuple[int, int, int, int]:
    value = region(value)
    return (
        max(0, math.floor(value["x"] * width)),
        max(0, math.floor(value["y"] * height)),
        min(width, math.ceil(round((value["x"] + value["width"]) * width, 9))),
        min(height, math.ceil(round((value["y"] + value["height"]) * height, 9))),
    )


def timed_cues(observations: list[dict]) -> list[dict]:
    """Conservative exact-text grouping. Never bridge a blank or a sampling gap."""
    cues: list[dict] = []
    adjacent = False
    for item in observations:
        lines = sorted(item["detections"], key=lambda d: (d["box"][1], d["box"][0]))
        text = "\n".join(
            unicodedata.normalize("NFC", line["text"]).strip()
            for line in lines
            if line["text"].strip()
        )
        if len(text) > 10000:
            raise WorkerError("VISION_RESULT_TOO_LARGE")
        if not text:
            adjacent = False
            continue
        if (
            adjacent
            and cues
            and cues[-1]["text"] == text
            and cues[-1]["end_ms"] == item["start_ms"]
        ):
            cues[-1]["end_ms"] = item["end_ms"]
        else:
            cues.append(
                {
                    "id": f"ocr-{len(cues) + 1:06d}",
                    "start_ms": item["start_ms"],
                    "end_ms": item["end_ms"],
                    "text": text,
                }
            )
        adjacent = True
    return cues


class RapidAdapter:
    """RapidOCR public callable seam; result text is data, never instructions."""

    def __init__(self, engine):
        self.engine = engine

    def detect(self, rgb, *, confidence: float = 0.5, rectangle: dict | None = None) -> list[dict]:
        import cv2
        import numpy as np

        height, width = rgb.shape[:2]
        x0, y0, x1, y1 = (
            pixel_rect(rectangle, width, height) if rectangle else (0, 0, width, height)
        )
        result = self.engine(
            cv2.cvtColor(rgb[y0:y1, x0:x1], cv2.COLOR_RGB2BGR), use_cls=False, text_score=confidence
        )
        boxes, texts, scores = result.boxes, result.txts, result.scores
        if boxes is None and texts is None:
            return []
        if (
            boxes is None
            or texts is None
            or scores is None
            or not len(boxes) == len(texts) == len(scores)
        ):
            raise WorkerError("MODEL_OUTPUT_INVALID")
        if len(boxes) > 100:
            raise WorkerError("VISION_RESULT_TOO_LARGE")
        detections = []
        for polygon, text, score in zip(boxes, texts, scores):
            points = np.asarray(polygon, dtype=np.float64)
            if (
                points.shape != (4, 2)
                or not np.isfinite(points).all()
                or not isinstance(text, str)
                or len(text) > 10000
                or "\x00" in text
                or not math.isfinite(float(score))
                or not 0 <= float(score) <= 1
            ):
                raise WorkerError("MODEL_OUTPUT_INVALID")
            if float(score) < confidence or not text.strip():
                continue
            left = max(x0, min(x1, math.floor(float(points[:, 0].min())) + x0))
            top = max(y0, min(y1, math.floor(float(points[:, 1].min())) + y0))
            right = max(x0, min(x1, math.ceil(float(points[:, 0].max())) + x0))
            bottom = max(y0, min(y1, math.ceil(float(points[:, 1].max())) + y0))
            if right > left and bottom > top:
                detections.append(
                    {
                        "text": unicodedata.normalize("NFC", text.strip()),
                        "confidence": float(score),
                        "box": [left, top, right, bottom],
                    }
                )
        return detections
