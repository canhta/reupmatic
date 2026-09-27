"""Group noisy OCR samples into one cue per original subtitle line.

One burned-in subtitle is sampled many times. A single misread character must not break it into
fragments, so consecutive samples merge when their normalized text is close and their text boxes
overlap. A real change of line — low similarity, or a blank sample — always splits. The cue text
is a confidence-weighted vote across its samples.
"""

from __future__ import annotations

import unicodedata
from typing import Any

# Tuned for subtitle-sized lines: one misread character in ten keeps ~0.9 similarity, while two
# unrelated lines fall below the floor. Both thresholds are named so fixtures can pin them.
TEXT_SIMILARITY_MIN = 0.7
BOX_OVERLAP_MIN = 0.5
# Edit distance is quadratic; beyond this the samples are compared for equality only.
MAX_COMPARE_UNITS = 512


def normalize(text: str) -> str:
    """NFC, whitespace and punctuation stripped, case-folded; comparison only, never displayed."""
    folded = unicodedata.normalize("NFC", text).casefold()
    return "".join(
        character
        for character in folded
        if not character.isspace() and not unicodedata.category(character).startswith("P")
    )


def _levenshtein(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    previous = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        current = [i]
        for j, b in enumerate(right, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a != b)))
        previous = current
    return previous[-1]


def similarity(left: str, right: str) -> float:
    if left == right:
        return 1.0
    if not left or not right:
        return 0.0
    if len(left) > MAX_COMPARE_UNITS or len(right) > MAX_COMPARE_UNITS:
        return 0.0
    return 1 - _levenshtein(left, right) / max(len(left), len(right))


def _area(box: tuple[int, int, int, int]) -> int:
    return max(0, box[2] - box[0]) * max(0, box[3] - box[1])


def box_overlap(
    left: tuple[int, int, int, int] | None, right: tuple[int, int, int, int] | None
) -> float:
    if left is None or right is None:
        return 0.0
    x0, y0 = max(left[0], right[0]), max(left[1], right[1])
    x1, y1 = min(left[2], right[2]), min(left[3], right[3])
    intersection = max(0, x1 - x0) * max(0, y1 - y0)
    union = _area(left) + _area(right) - intersection
    return intersection / union if union > 0 else 0.0


# A line joins the subtitle row while its vertical center stays within this multiple of the
# dominant line's height; a distant banner stays out and a two-line subtitle stays in.
ROW_CENTER_TOLERANCE = 1.5


def select_subtitle_row(detections: list[dict]) -> list[dict]:
    """The largest text line plus the lines on its row, excluding text elsewhere in the frame.

    OCR reports every text in a frame. A persistent banner must not join a subtitle line, grow its
    box, or widen the region that boundary refinement compares. The dominant line is the largest
    by area, which for burned-in subtitles is the subtitle rather than a watermark or prompt.
    """
    lines = [d for d in detections if d["text"].strip()]
    if len(lines) <= 1:
        return lines
    dominant = max(lines, key=lambda d: _area(d["box"]))
    height = max(1, dominant["box"][3] - dominant["box"][1])
    tolerance = height * ROW_CENTER_TOLERANCE
    dominant_center = (dominant["box"][1] + dominant["box"][3]) / 2
    left, right = dominant["box"][0], dominant["box"][2]
    return [
        line
        for line in lines
        if abs((line["box"][1] + line["box"][3]) / 2 - dominant_center) <= tolerance
        and line["box"][2] > left
        and line["box"][0] < right
    ]


def summarize(observation: dict) -> tuple[str, str, tuple[int, int, int, int] | None, float]:
    """Display text, normalized text, union box and mean confidence of one sample."""
    detections = select_subtitle_row(observation.get("detections", []))
    lines = sorted(detections, key=lambda d: (d["box"][1], d["box"][0]))
    display = "\n".join(unicodedata.normalize("NFC", line["text"]).strip() for line in lines)
    if not display:
        return "", "", None, 0.0
    box = (
        min(d["box"][0] for d in detections),
        min(d["box"][1] for d in detections),
        max(d["box"][2] for d in detections),
        max(d["box"][3] for d in detections),
    )
    weight = sum(float(d["confidence"]) for d in detections) / len(detections)
    return display, normalize(display), box, weight


def merge_box(left: tuple[int, int, int, int], right: tuple[int, int, int, int]) -> tuple:
    return (
        min(left[0], right[0]),
        min(left[1], right[1]),
        max(left[2], right[2]),
        max(left[3], right[3]),
    )


# Two text boxes belong to one position while their centers stay this close, per axis.
POSITION_TOLERANCE_X_PCT = 15
POSITION_TOLERANCE_Y_PCT = 6
MAX_REGIONS = 32


class RegionCollector:
    """Cluster each observation's text-box union into distinct on-screen positions.

    Streaming, so a whole-source scan clusters every observation rather than a 20-sample preview.
    Positions are most frequent first, in source-frame percentages, capped at MAX_REGIONS.
    """

    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.clusters: list[dict] = []

    def add(self, observation: dict) -> None:
        box = summarize(observation)[2]
        if box is None:
            return
        center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
        x_tolerance = self.width * POSITION_TOLERANCE_X_PCT / 100
        y_tolerance = self.height * POSITION_TOLERANCE_Y_PCT / 100
        for cluster in self.clusters:
            anchor = cluster["anchor"]
            if (
                abs(center[0] - anchor[0]) <= x_tolerance
                and abs(center[1] - anchor[1]) <= y_tolerance
            ):
                cluster["box"] = merge_box(cluster["box"], box)
                cluster["count"] += 1
                return
        self.clusters.append({"anchor": center, "box": box, "count": 1})

    def finish(self) -> list[dict]:
        regions = [
            {
                "x_pct": cluster["box"][0] / self.width * 100,
                "y_pct": cluster["box"][1] / self.height * 100,
                "width_pct": (cluster["box"][2] - cluster["box"][0]) / self.width * 100,
                "height_pct": (cluster["box"][3] - cluster["box"][1]) / self.height * 100,
                "count": cluster["count"],
            }
            for cluster in self.clusters
        ]
        regions.sort(key=lambda region: (-region["count"], region["y_pct"]))
        return regions[:MAX_REGIONS]


class _Group:
    def __init__(self, observation: dict):
        self.start_ms = observation["start_ms"]
        self.end_ms = observation["end_ms"]
        self.first = observation
        self.last = observation
        self.prev: dict | None = None
        self.next: dict | None = None
        self.last_boxes: tuple[int, int, int, int] | None = None
        self.variants: dict[str, list[Any]] = {}

    def extend(
        self,
        display: str,
        normalized: str,
        boxes: tuple[int, int, int, int] | None,
        weight: float,
        observation: dict,
    ) -> None:
        self.end_ms = observation["end_ms"]
        self.last = observation
        self.last_boxes = boxes
        entry = self.variants.setdefault(normalized, [display, 0.0])
        entry[1] += weight

    @property
    def representative(self) -> str:
        if not self.variants:
            return ""
        return max(self.variants, key=lambda key: self.variants[key][1])

    def text(self) -> str:
        return self.variants[self.representative][0] if self.variants else ""


class CueGrouper:
    """Streaming merger: feed every sample, close groups as the line changes or goes blank."""

    def __init__(self):
        self.groups: list[_Group] = []
        self.current: _Group | None = None
        self.previous: dict | None = None

    def add(self, observation: dict) -> None:
        display, normalized, boxes, weight = summarize(observation)
        if (
            display
            and self.current is not None
            and observation["start_ms"] == self.current.end_ms
            and similarity(self.current.representative, normalized) >= TEXT_SIMILARITY_MIN
            and box_overlap(self.current.last_boxes, boxes) >= BOX_OVERLAP_MIN
        ):
            self.current.extend(display, normalized, boxes, weight, observation)
        else:
            if self.current is not None:
                self.current.next = observation
                self.groups.append(self.current)
                self.current = None
            if display:
                self.current = _Group(observation)
                self.current.prev = self.previous
                self.current.extend(display, normalized, boxes, weight, observation)
        self.previous = observation

    def finish(self) -> list[_Group]:
        if self.current is not None:
            self.groups.append(self.current)
            self.current = None
        return self.groups


def timed_cues(observations: list[dict]) -> list[dict]:
    grouper = CueGrouper()
    for observation in observations:
        grouper.add(observation)
    return [
        {
            "id": f"ocr-{index:06d}",
            "start_ms": group.start_ms,
            "end_ms": group.end_ms,
            "text": group.text(),
        }
        for index, group in enumerate(grouper.finish(), 1)
    ]
