"""Bounded timing/mask adaptation. Native image work stays in OpenCV/NumPy/ORT.

Imports are lazy so missing vision dependencies do not disable core rendering.
"""

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


def make_mask(
    width: int, height: int, rectangle: dict | None, detections: list[dict], padding: int
):
    import cv2
    import numpy as np

    mask = np.zeros((height, width), dtype=np.uint8)
    boxes = [pixel_rect(rectangle, width, height)] if rectangle else [d["box"] for d in detections]
    for box in boxes:
        x0, y0, x1, y1 = box
        x0, y0 = max(0, int(math.floor(x0))), max(0, int(math.floor(y0)))
        x1, y1 = min(width, int(math.ceil(x1))), min(height, int(math.ceil(y1)))
        if x1 > x0 and y1 > y0:
            mask[y0:y1, x0:x1] = 255
    if padding:
        kernel = np.ones((padding * 2 + 1, padding * 2 + 1), dtype=np.uint8)
        mask = cv2.dilate(mask, kernel)
    return mask


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


class LamaAdapter:
    """Carve lama_fp32.onnx: RGB float32 [0,1], binary mask; output RGB [0,255].

    One ORT session is reused across a request. It is hosted in a killable child,
    never in the worker reader thread. A session double is not a model benchmark.
    """

    def __init__(self, session):
        self.session = session
        inputs = {item.name: item for item in session.get_inputs()}
        if (
            set(inputs) != {"image", "mask"}
            or list(inputs["image"].shape) != [1, 3, 512, 512]
            or list(inputs["mask"].shape) != [1, 1, 512, 512]
            or any(item.type != "tensor(float)" for item in inputs.values())
        ):
            raise WorkerError("MODEL_SHAPE_UNSUPPORTED")

    def erase(self, rgb, mask):
        import cv2
        import numpy as np

        if (
            rgb.ndim != 3
            or rgb.shape[2] != 3
            or rgb.dtype != np.uint8
            or mask.shape != rgb.shape[:2]
            or mask.dtype != np.uint8
        ):
            raise WorkerError("MODEL_OUTPUT_INVALID")
        ys, xs = np.where(mask > 0)
        if not len(xs):
            return rgb.copy()
        context = max(32, int(max(xs.max() - xs.min(), ys.max() - ys.min()) * 0.2))
        left, top = max(0, int(xs.min()) - context), max(0, int(ys.min()) - context)
        right = min(rgb.shape[1], int(xs.max()) + 1 + context)
        bottom = min(rgb.shape[0], int(ys.max()) + 1 + context)
        crop, crop_mask = rgb[top:bottom, left:right], mask[top:bottom, left:right]
        h, w = crop.shape[:2]
        scale = 512 / max(h, w)
        rw, rh = max(1, round(w * scale)), max(1, round(h * scale))
        image = cv2.resize(
            crop, (rw, rh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
        )
        binary = cv2.resize(crop_mask, (rw, rh), interpolation=cv2.INTER_NEAREST)
        image = cv2.copyMakeBorder(image, 0, 512 - rh, 0, 512 - rw, cv2.BORDER_REFLECT_101)
        binary = cv2.copyMakeBorder(binary, 0, 512 - rh, 0, 512 - rw, cv2.BORDER_CONSTANT, value=0)
        feed = {
            "image": np.ascontiguousarray(image.transpose(2, 0, 1)[None], dtype=np.float32) / 255,
            "mask": np.ascontiguousarray((binary > 0)[None, None], dtype=np.float32),
        }
        output = self.session.run(None, feed)[0]
        if (
            output.shape != (1, 3, 512, 512)
            or not np.isfinite(output).all()
            or float(output.min()) < -1
            or float(output.max()) > 256
        ):
            raise WorkerError("MODEL_OUTPUT_INVALID")
        reconstructed = np.clip(output[0].transpose(1, 2, 0)[:rh, :rw], 0, 255).astype(np.uint8)
        reconstructed = cv2.resize(reconstructed, (w, h), interpolation=cv2.INTER_LINEAR)
        result = rgb.copy()
        # Exact pixel preservation outside the mask BEFORE video encoding.
        result[top:bottom, left:right] = np.where(crop_mask[:, :, None] > 0, reconstructed, crop)
        return result
