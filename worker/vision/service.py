"""Vision request orchestration over the existing worker queue and native tools."""

from __future__ import annotations

import json
import math
import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

from media.probe import probe_file
from runtime.context import WorkerContext
from runtime.errors import WorkerError
from subtitles.validation import validate_cues

from vision.algorithms import region
from vision.models import file_hash

MAX_TIME = 86400000
MAX_RESULT = 1024 * 1024
MAX_OCR_EDGE = 1920
MAX_SEGMENT_BYTES = 2 * 1024**3
DISK_RESERVE = 64 * 1024**2


def parse_options(method: str, params: object) -> dict:
    common = {"asset_id", "start_ms", "end_ms"}
    ocr = method in ("media.ocr", "media.ocr.extract")
    required = common | (
        {"language", "sample_ms", "min_confidence"} if ocr else {"target", "padding_px"}
    )
    allowed = required | {"region"} | (set() if ocr else {"language"})
    if (
        not isinstance(params, dict)
        or not required <= params.keys()
        or params.keys() - allowed
        or not isinstance(params["asset_id"], str)
        or not 0 < len(params["asset_id"]) <= 128
        or "\x00" in params["asset_id"]
    ):
        raise WorkerError("INVALID_REQUEST")
    start, end = params["start_ms"], params["end_ms"]
    if type(start) is not int or type(end) is not int or not 0 <= start < end <= MAX_TIME:
        raise WorkerError("INVALID_REQUEST")
    if method == "media.ocr.extract" and start != 0:
        raise WorkerError("INVALID_REQUEST")
    if method != "media.ocr.extract" and end - start > (120000 if ocr else 10000):
        raise WorkerError("VISION_LIMIT")
    if "region" in params:
        region(params["region"])
    if ocr:
        sample, confidence = params["sample_ms"], params["min_confidence"]
        if (
            type(sample) is not int
            or not 100 <= sample <= 2000
            or type(confidence) not in (int, float)
            or not math.isfinite(confidence)
            or not 0 <= confidence <= 1
        ):
            raise WorkerError("INVALID_REQUEST")
    else:
        if (
            params["target"] not in ("manual", "text")
            or type(params["padding_px"]) is not int
            or not 0 <= params["padding_px"] <= 32
        ):
            raise WorkerError("INVALID_REQUEST")
        if params["target"] == "manual":
            if "region" not in params or "language" in params:
                raise WorkerError("INVALID_REQUEST")
        elif "region" in params:
            raise WorkerError("INVALID_REQUEST")
    if ocr or params["target"] == "text":
        if params.get("language") not in ("en", "vi", "zh"):
            raise WorkerError("INVALID_REQUEST")
    return dict(params)


class VisionService:
    def __init__(self, worker: WorkerContext):
        self.worker = worker

    def run(self, req: dict, *, staging: Path | None = None, emit_progress=None) -> dict:
        host = self.worker
        emit = emit_progress or (lambda data: host.emit(req, "progress", data))
        params = parse_options(req["method"], req["params"])
        source = host.assets.get(params["asset_id"], "video")
        ocr = req["method"] == "media.ocr"
        kind = "ocr" if ocr else "inpainting"

        def check():
            return host.cancelled(req)

        models = {}
        if ocr or params["target"] == "text":
            models["ocr"] = host.models.require("ocr", params["language"], check=check)
        if not ocr:
            models["inpainting"] = host.models.require("inpainting", check=check)
        info = probe_file(host, req, source["path"])
        if params["end_ms"] > info["duration_ms"]:
            raise WorkerError("INVALID_REQUEST")
        # Native autorotation is applied by FFmpeg. Read display geometry rather
        # than silently using coded dimensions for normalized masks.
        stream_info = json.loads(
            host.process.run(
                req,
                [
                    host.ffprobe,
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=width,height,sample_aspect_ratio:stream_side_data=rotation",
                    "-of",
                    "json",
                    str(source["path"]),
                ],
                timeout=30,
            )
        )["streams"][0]
        if stream_info.get("sample_aspect_ratio", "1:1") not in ("1:1", "0:1", "N/A"):
            raise WorkerError("VISION_FORMAT_UNSUPPORTED")
        rotation = next(
            (d["rotation"] for d in stream_info.get("side_data_list", []) if "rotation" in d), 0
        )
        if rotation % 90:
            raise WorkerError("VISION_FORMAT_UNSUPPORTED")
        source_w, source_h = stream_info["width"], stream_info["height"]
        if abs(rotation) % 180 == 90:
            source_w, source_h = source_h, source_w
        factor = min(1, (MAX_OCR_EDGE if ocr else 960) / max(source_w, source_h))
        width = max(2, int(source_w * factor) // 2 * 2)
        height = max(2, int(source_h * factor) // 2 * 2)
        rate = 1000 / params["sample_ms"] if ocr else 24
        duration = (params["end_ms"] - params["start_ms"]) / 1000
        max_frames = math.ceil(duration * rate)
        frame_size = width * height * 3
        required_disk = frame_size * max_frames * (1 if ocr else 2) + DISK_RESERVE
        if required_disk > MAX_SEGMENT_BYTES:
            raise WorkerError("VISION_LIMIT")
        if shutil.disk_usage(host.workspace).free < required_disk:
            raise WorkerError("VISION_DISK_LOW")
        start = params["start_ms"] / 1000
        emit({"phase": "visionDecoding", "fraction": None})
        with tempfile.TemporaryDirectory(dir=host.workspace, prefix="vision-") as directory:
            tmp = Path(directory)
            frames, processed = tmp / "input.rgb", tmp / "processed.rgb"
            host.process.run(
                req,
                [
                    host.ffmpeg,
                    "-v",
                    "error",
                    "-nostdin",
                    "-threads",
                    "2",
                    "-ss",
                    str(start),
                    "-i",
                    str(source["path"]),
                    "-t",
                    str(duration),
                    "-map",
                    "0:v:0",
                    "-an",
                    "-sn",
                    "-vf",
                    f"fps={rate}:start_time=0,scale={width}:{height},setsar=1",
                    "-frames:v",
                    str(max_frames),
                    "-pix_fmt",
                    "rgb24",
                    "-f",
                    "rawvideo",
                    "-threads",
                    "1",
                    "-n",
                    str(frames),
                ],
            )
            size = frames.stat().st_size
            count = size // frame_size
            if size % frame_size or not 0 < count <= max_frames:
                raise WorkerError("VISION_FRAME_INVALID")
            host.assets.get(params["asset_id"], "video")
            job = {
                **params,
                "kind": kind,
                "models": models,
                "width": width,
                "height": height,
                "frame_count": count,
                "input_frames": str(frames),
                "output_frames": str(processed),
            }
            job_path = tmp / "request.json"
            job_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
            phase = "visionRecognizing" if ocr else "visionInpainting"
            emit({"phase": phase, "fraction": 0})
            last = -1

            def progress():
                nonlocal last
                try:
                    with (tmp / "progress.json").open("rb") as stream:
                        value = json.loads(stream.read(1024))
                    completed = value.get("completed")
                    if type(completed) is int and last < completed <= count:
                        last = completed
                        emit({"phase": phase, "fraction": completed / count})
                except (OSError, ValueError, TypeError, AttributeError):
                    pass

            host.process.run(
                req,
                [sys.executable, "-u", "-m", "vision.runner", str(job_path)],
                cwd=Path(__file__).resolve().parents[1],
                timeout=3600,
                on_poll=progress,
            )
            progress()
            with (tmp / "result.json").open("rb") as stream:
                raw = stream.read(MAX_RESULT + 1)
            if len(raw) > MAX_RESULT:
                raise WorkerError("VISION_RESULT_TOO_LARGE")
            response = json.loads(raw)
            if response.get("ok") is not True:
                known = {
                    "MODEL_HASH_MISMATCH",
                    "MODEL_RUNTIME_MISSING",
                    "MODEL_INFERENCE_FAILED",
                    "MODEL_NETWORK_DISABLED",
                    "MODEL_SHAPE_UNSUPPORTED",
                    "MODEL_OUTPUT_INVALID",
                    "VISION_FRAME_INVALID",
                    "VISION_RESULT_TOO_LARGE",
                }
                raise WorkerError(
                    response.get("code")
                    if response.get("code") in known
                    else "MODEL_INFERENCE_FAILED"
                )
            data = response["data"]
            if not isinstance(data, dict):
                raise WorkerError("MODEL_OUTPUT_INVALID")
            host.assets.get(params["asset_id"], "video")
            # The full-processing parent hashes sources before execution and publication.
            if staging is None and file_hash(source["path"], check) != source["sha256"]:
                raise WorkerError("SOURCE_CHANGED")
            metadata = {
                "kind": kind,
                "asset_id": params["asset_id"],
                "source_sha256": source["sha256"],
                "start_ms": params["start_ms"],
                "end_ms": params["end_ms"],
                "width": width,
                "height": height,
                "model_fingerprints": {
                    key: bundle["fingerprint"] for key, bundle in models.items()
                },
                "algorithm_version": "vision-0.6.0",
            }
            if ocr:
                # Serialized evidence is independent of the mutable project cue track.
                validate_cues(data.get("cues"))
                if (
                    not isinstance(data.get("observations"), list)
                    or len(data["observations"]) > 1200
                ):
                    raise WorkerError("MODEL_OUTPUT_INVALID")
                result = {
                    **metadata,
                    **data,
                    "language": params["language"],
                    "sample_ms": params["sample_ms"],
                    "analysis_id": str(uuid.uuid4()),
                }
                encoded = json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
                if len(encoded) > MAX_RESULT:
                    raise WorkerError("VISION_RESULT_TOO_LARGE")
                analyses = staging or host.workspace / "analyses"
                analyses.mkdir(exist_ok=True)
                analysis_file = tmp / "analysis.json"
                analysis_file.write_bytes(encoded)
                check()
                os.replace(analysis_file, analyses / f"{result['analysis_id']}.json")
                return result
            if processed.stat().st_size != frame_size * count:
                raise WorkerError("VISION_FRAME_INVALID")
            emit({"phase": "visionEncoding", "fraction": None})
            output = tmp / ("chunk.mkv" if staging else "sample.mp4")
            args = [
                host.ffmpeg,
                "-v",
                "error",
                "-nostdin",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "-s",
                f"{width}x{height}",
                "-r",
                "24",
                "-i",
                str(processed),
            ]
            if staging:
                args += ["-map", "0:v:0", "-an", "-c:v", "ffv1", "-level", "3"]
            else:
                args += [
                    "-ss",
                    str(start),
                    "-i",
                    str(source["path"]),
                    "-t",
                    str(duration),
                    "-map",
                    "0:v:0",
                    "-map",
                    "1:a:0?",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "fast",
                    "-crf",
                    "18",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-movflags",
                    "+faststart",
                ]
            args += ["-map_metadata", "-1", "-threads", "2", "-n", str(output)]
            host.process.run(req, args)
            generated = probe_file(host, req, output)
            host.assets.get(params["asset_id"], "video")
            # The full-processing parent hashes sources before execution and publication.
            if staging is None and file_hash(source["path"], check) != source["sha256"]:
                raise WorkerError("SOURCE_CHANGED")
            aid = str(uuid.uuid4())
            result = {
                **metadata,
                **data,
                "artifact_id": aid,
                "path": str((staging or host.cache) / f"{aid}{output.suffix}"),
                "duration_ms": generated["duration_ms"],
                "has_audio": generated["has_audio"],
                "fps": 24,
                "cache_hit": False,
                "sha256": file_hash(output, check),
            }
            check()
            os.replace(output, result["path"])
            return result
