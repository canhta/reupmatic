"""Bounded OCR scanning shared by extraction and subtitle-burning workflows."""

import json

from runtime.errors import WorkerError
from subtitles.validation import validate_cues
from vision.service import MAX_RESULT, VisionService

from processing.chunks import intervals, ocr_window, progress_for, verify_segment_models

MAX_EVIDENCE_BYTES = 128 * 1024**2


def scan_cues(host, req, options, start, end, staging, fingerprints, *, keep_evidence=False):
    service = VisionService(host)
    cues, observations, chunks = [], [], []
    text_bytes = evidence_bytes = observation_count = 0
    geometry = None
    for first, last in intervals(start, end, ocr_window(options["sample_ms"])):
        host.cancelled(req)
        result = service.run(
            {
                **req,
                "method": "media.ocr",
                "params": {
                    **options,
                    "asset_id": req["params"]["asset_id"],
                    "start_ms": first,
                    "end_ms": last,
                },
            },
            staging=staging,
            emit_progress=progress_for(host, req, "processingOcr", first, last, start, end),
        )
        verify_segment_models(result, fingerprints, options, "media.ocr")
        current = (result["width"], result["height"])
        if geometry is not None and current != geometry:
            raise WorkerError("VISION_FRAME_INVALID")
        geometry = current
        for cue in result["cues"]:
            if cues and cues[-1]["text"] == cue["text"] and cues[-1]["end_ms"] == cue["start_ms"]:
                cues[-1]["end_ms"] = cue["end_ms"]
            else:
                text_bytes += len(cue["text"].encode("utf-8"))
                if len(cues) >= 10000 or text_bytes > MAX_RESULT:
                    raise WorkerError("PROCESSING_CUE_LIMIT")
                cues.append({**cue, "id": f"ocr-{len(cues) + 1:06d}"})
        observation_count += len(result["observations"])
        observations.extend(result["observations"][: max(0, 20 - len(observations))])
        evidence = staging / f"{result['analysis_id']}.json"
        if keep_evidence:
            evidence_bytes += evidence.stat().st_size
            if evidence_bytes > MAX_EVIDENCE_BYTES:
                raise WorkerError("VISION_EVIDENCE_LIMIT")
            chunks.append({"file": evidence.name, "start_ms": first, "end_ms": last})
        else:
            evidence.unlink()
        host.emit(
            req, "progress", {"phase": "processingOcr", "fraction": (last - start) / (end - start)}
        )
    validate_cues(cues)
    if len(json.dumps(cues, ensure_ascii=False).encode("utf-8")) > MAX_RESULT:
        raise WorkerError("VISION_RESULT_TOO_LARGE")
    return {
        "cues": cues,
        "observations": observations,
        "observation_count": observation_count,
        "chunks": chunks,
        "width": geometry[0],
        "height": geometry[1],
    }


def scan_subtitles(host, req, options, start, end, staging, fingerprints):
    from subtitles.service import cue_document

    result = scan_cues(host, req, options, start, end, staging, fingerprints)
    if not result["cues"]:
        return None, 0
    subtitles = cue_document(host, {**req, "params": {"cues": result["cues"]}})
    filename = staging / "track.srt"
    subtitles.save(str(filename), encoding="utf-8", format_="srt")
    return filename, len(result["cues"])
