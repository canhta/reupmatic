"""Independent full-source text extraction; publication never renders video."""

import json
import os
import tempfile
import uuid
from pathlib import Path

from media.probe import probe_file
from processing.ocr_scan import scan_cues
from processing.recipe import resolve_models
from runtime.errors import WorkerError

from vision.service import MAX_RESULT, parse_options


def extract_ocr(host, req):
    params = parse_options("media.ocr.extract", req["params"])

    def check():
        return host.cancelled(req)

    source = host.assets.verify(params["asset_id"], "video", check)
    info = probe_file(host, req, source["path"])
    if params["end_ms"] != info["duration_ms"]:
        raise WorkerError("INVALID_REQUEST")
    options = {
        key: value for key, value in params.items() if key not in ("asset_id", "start_ms", "end_ms")
    }
    processing = {
        "ocr": {key: options[key] for key in ("language", "sample_ms", "min_confidence")},
    }
    fingerprints = resolve_models(host, req, processing)
    analyses = host.workspace / "analyses"
    analyses.mkdir(exist_ok=True)
    analysis_id = str(uuid.uuid4())
    with tempfile.TemporaryDirectory(dir=host.workspace, prefix="ocr-extract-") as directory:
        staging = Path(directory) / "evidence"
        staging.mkdir()
        result = scan_cues(
            host, req, options, 0, params["end_ms"], staging, fingerprints, keep_evidence=True
        )
        chunks = result.pop("chunks")
        result.update(
            {
                "kind": "ocr",
                "asset_id": params["asset_id"],
                "source_sha256": source["sha256"],
                "start_ms": 0,
                "end_ms": params["end_ms"],
                "language": params["language"],
                "sample_ms": params["sample_ms"],
                "analysis_id": analysis_id,
                "model_fingerprints": {"ocr": fingerprints["ocr_" + params["language"]]},
                "algorithm_version": "ocr-extraction-0.10.0",
                "scope": "full-source",
                "evidence": {
                    "chunks": len(chunks),
                    "preview_count": len(result["observations"]),
                    "observation_count": result["observation_count"],
                },
            }
        )
        encoded = json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
        if len(encoded) > MAX_RESULT:
            raise WorkerError("VISION_RESULT_TOO_LARGE")
        (staging / "summary.json").write_bytes(encoded)
        (staging / "chunks.json").write_text(
            json.dumps(chunks, ensure_ascii=False), encoding="utf-8"
        )
        host.assets.verify(params["asset_id"], "video", check)
        if resolve_models(host, req, processing) != fingerprints:
            raise WorkerError("PROCESSING_MODELS_CHANGED")
        check()
        os.rename(staging, analyses / analysis_id)
        return result
