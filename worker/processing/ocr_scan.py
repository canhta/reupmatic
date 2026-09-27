"""Bounded OCR scanning shared by extraction and subtitle-burning workflows."""

import json

from runtime.errors import WorkerError
from subtitles.validation import validate_cues
from vision.merge import CueGrouper, RegionCollector
from vision.refine import refine_groups
from vision.service import MAX_RESULT, VisionService

from processing.chunks import intervals, ocr_window, progress_for, verify_segment_models

MAX_EVIDENCE_BYTES = 128 * 1024**2


def scan_cues(
    host, req, options, start, end, staging, fingerprints, *, keep_evidence=False, refine=None
):
    service = VisionService(host)
    grouper = CueGrouper()
    observations, chunks = [], []
    evidence_bytes = observation_count = 0
    geometry = None
    regions = None
    for first, last in intervals(start, end, ocr_window(options["sample_ms"])):
        host.cancelled(req)
        result = service.run(
            {
                **req,
                "method": "vision.ocr",
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
        verify_segment_models(result, fingerprints, options, "vision.ocr")
        current = (result["width"], result["height"])
        if geometry is not None and current != geometry:
            raise WorkerError("VISION_FRAME_INVALID")
        geometry = current
        if regions is None:
            regions = RegionCollector(geometry[0], geometry[1])
        for observation in result["observations"]:
            grouper.add(observation)
            regions.add(observation)
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
    groups = grouper.finish()
    refiner = refine if refine is not None else refine_groups
    if groups and refiner is not None:
        source = host.assets.get(req["params"]["asset_id"], "video")

        def refine_progress(fraction):
            host.emit(req, "progress", {"phase": "processingOcrRefine", "fraction": fraction})

        host.emit(req, "progress", {"phase": "processingOcrRefine", "fraction": 0})
        refiner(
            host,
            req,
            source["path"],
            geometry[0],
            geometry[1],
            groups,
            on_progress=refine_progress,
        )
    cues, text_bytes = [], 0
    for index, group in enumerate(groups, 1):
        text_bytes += len(group.text().encode("utf-8"))
        if index > 10000 or text_bytes > MAX_RESULT:
            raise WorkerError("PROCESSING_CUE_LIMIT")
        cues.append(
            {
                "id": f"ocr-{index:06d}",
                "start_ms": group.start_ms,
                "end_ms": group.end_ms,
                "text": group.text(),
            }
        )
    validate_cues(cues)
    if len(json.dumps(cues, ensure_ascii=False).encode("utf-8")) > MAX_RESULT:
        raise WorkerError("VISION_RESULT_TOO_LARGE")
    return {
        "cues": cues,
        "observations": observations,
        "regions": regions.finish() if regions is not None else [],
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
