"""Single-request inference subprocess. The parent owns FFmpeg and cancellation.

Only developer-provided local artifacts are used. No server, installer, user
plugin command or mock fallback exists in this production entry point.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from runtime.errors import WorkerError
from runtime.offline import deny_network_and_children

from vision.algorithms import LamaAdapter, RapidAdapter, make_mask, timed_cues
from vision.models import file_hash


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    temporary.replace(path)


def verify_bundle(bundle: dict) -> None:
    for value in bundle.values():
        if isinstance(value, dict) and set(value) == {"path", "sha256"}:
            if file_hash(Path(value["path"])) != value["sha256"]:
                raise WorkerError("MODEL_HASH_MISMATCH")


def make_ocr(bundle: dict) -> RapidAdapter:
    from rapidocr import RapidOCR
    from rapidocr.utils.typings import EngineType, LangRec, ModelType, OCRVersion

    params = {
        "Global.use_cls": False,
        "Global.log_level": "error",
        "Global.text_score": 0.5,
        "Det.engine_type": EngineType("onnxruntime"),
        "Rec.engine_type": EngineType("onnxruntime"),
        "Det.model_type": ModelType("mobile"),
        "Rec.model_type": ModelType("mobile"),
        "Det.ocr_version": OCRVersion(bundle["det_version"]),
        "Rec.ocr_version": OCRVersion(bundle["rec_version"]),
        "Det.model_path": bundle["det"]["path"],
        "Rec.model_path": bundle["rec"]["path"],
        "Rec.rec_keys_path": bundle["keys"]["path"],
        "Rec.rec_img_shape": [3, bundle["rec_height"], 320],
        "Rec.lang_type": LangRec({"zh": "ch", "en": "en", "vi": "latin"}[bundle["language"]]),
        "EngineConfig.onnxruntime.intra_op_num_threads": 2,
        "EngineConfig.onnxruntime.inter_op_num_threads": 1,
        "EngineConfig.onnxruntime.use_cuda": False,
    }
    return RapidAdapter(RapidOCR(params=params))


def make_lama(bundle: dict) -> LamaAdapter:
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return LamaAdapter(
        ort.InferenceSession(
            bundle["model"]["path"], sess_options=options, providers=["CPUExecutionProvider"]
        )
    )


def run(job: dict, progress: Path) -> dict:
    import numpy as np

    for bundle in job["models"].values():
        verify_bundle(bundle)
    ocr = make_ocr(job["models"]["ocr"]) if "ocr" in job["models"] else None
    lama = make_lama(job["models"]["inpainting"]) if job["kind"] == "inpainting" else None
    width, height = job["width"], job["height"]
    frame_size = width * height * 3
    observations = []
    observations_bytes = 0
    changed_frames = 0
    output = Path(job["output_frames"]).open("xb") if lama else None
    try:
        with Path(job["input_frames"]).open("rb") as frames:
            for index in range(job["frame_count"]):
                raw = frames.read(frame_size)
                if len(raw) != frame_size:
                    raise WorkerError("VISION_FRAME_INVALID")
                rgb = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
                detections = (
                    ocr.detect(
                        rgb,
                        confidence=job.get("min_confidence", 0.5),
                        rectangle=job.get("region") if not lama else None,
                    )
                    if ocr
                    else []
                )
                if not lama:
                    start = job["start_ms"] + index * job["sample_ms"]
                    item = {
                        "start_ms": start,
                        "end_ms": min(start + job["sample_ms"], job["end_ms"]),
                        "detections": detections,
                    }
                    if item["start_ms"] < item["end_ms"]:
                        observations_bytes += len(
                            json.dumps(item, ensure_ascii=False).encode("utf-8")
                        )
                        if observations_bytes > 700000:
                            raise WorkerError("VISION_RESULT_TOO_LARGE")
                        observations.append(item)
                else:
                    mask = make_mask(
                        width,
                        height,
                        job.get("region") if job["target"] == "manual" else None,
                        detections,
                        job["padding_px"],
                    )
                    changed_frames += int(bool(np.any(mask)))
                    output.write(lama.erase(rgb, mask).tobytes())
                atomic_json(progress, {"completed": index + 1, "total": job["frame_count"]})
            if frames.read(1):
                raise WorkerError("VISION_FRAME_INVALID")
    finally:
        if output:
            output.close()
    for bundle in job["models"].values():
        verify_bundle(bundle)
    if lama:
        return {"processed_frames": job["frame_count"], "masked_frames": changed_frames}
    return {
        "observations": observations,
        "cues": timed_cues(observations),
        "sampled_frames": job["frame_count"],
    }


def main() -> None:
    # Parent constructs this path in a private temporary directory, never renderer input.
    job_path = Path(sys.argv[1])
    target = job_path.parent / "result.json"
    try:
        for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
            os.environ[name] = "2"
        sys.addaudithook(deny_network_and_children)
        job = json.loads(job_path.read_text(encoding="utf-8"))
        data = run(job, job_path.parent / "progress.json")
        result = {"ok": True, "data": data}
        if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > 1024 * 1024:
            raise WorkerError("VISION_RESULT_TOO_LARGE")
    except WorkerError as error:
        result = {"ok": False, "code": error.code}
    except (ImportError, ModuleNotFoundError):
        result = {"ok": False, "code": "MODEL_RUNTIME_MISSING"}
    except Exception:
        result = {"ok": False, "code": "MODEL_INFERENCE_FAILED"}
    atomic_json(target, result)


if __name__ == "__main__":
    main()
