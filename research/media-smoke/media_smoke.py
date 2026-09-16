"""Bounded native-media smoke test, not an editor or AI benchmark.

Uses installed Python + FFmpeg/ffprobe/libass only. Creates synthetic media
in a new output directory. No downloads, model execution, uploads, or fonts
are bundled. Run: python media_smoke.py /path/to/new-output-directory
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def run(args: list[str], cwd: Path, *, timeout: int = 40) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(args, cwd=cwd, text=True, encoding="utf-8", errors="replace",
                          capture_output=True, timeout=timeout, check=False)
    if proc.returncode:
        raise RuntimeError(f"Command failed ({proc.returncode}): {args}\n{proc.stderr[-4000:]}")
    return proc


def probe(path: str, cwd: Path) -> dict[str, Any]:
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format",
                           "-of", "json", path], cwd).stdout)


def frame_hashes(path: str, cwd: Path, start: float = 0, duration: float = 4) -> list[str]:
    result = run(["ffmpeg", "-v", "error", "-threads", "1", "-i", path,
                  "-ss", str(start), "-t", str(duration), "-map", "0:v:0", "-an",
                  "-f", "framemd5", "-"], cwd)
    return [line.split(",")[-1].strip() for line in result.stdout.splitlines()
            if line and not line.startswith("#")]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("output", type=Path)
    args = ap.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise RuntimeError(f"Required executable not found: {tool}")
    out = args.output.resolve()
    if out.exists() and any(out.iterdir()):
        raise RuntimeError("Choose a new or empty output directory; existing data is not overwritten.")
    out.mkdir(parents=True, exist_ok=True)
    base = ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-y", "-threads", "1"]
    info = run(["ffmpeg", "-version"], out).stdout
    cues = [(1000, 3000, "Xin chào! Phụ đề tiếng Việt."),
            (5000, 7000, "Chỉnh nội dung — giữ dấu tiếng Việt."),
            (9000, 11000, "English captions remain separate.")]

    def write_fixture(filename: str, rows: list[tuple[int, int, str]]) -> None:
        # Fixture serialization only; production subtitle I/O is delegated to pysubs2.
        def stamp(ms: int) -> str:
            return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"
        text = "\n\n".join(f"{i}\n{stamp(a)} --> {stamp(b)}\n{t}"
                           for i, (a, b, t) in enumerate(rows, 1)) + "\n"
        (out / filename).write_text(text, encoding="utf-8")

    write_fixture("cues.srt", cues)
    run(base + ["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=12",
                "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=12",
                "-map", "0:v", "-map", "1:a", "-c:v", "ffv1", "-level", "3",
                "-c:a", "flac", "-shortest", "source.mkv"], out)
    source_hash = hashlib.sha256((out / "source.mkv").read_bytes()).hexdigest()
    run(base + ["-i", "cues.srt", "cues.ass"], out)
    run(base + ["-i", "cues.ass", "roundtrip.srt"], out)

    def render(filename: str, start: int, duration: int, track: str) -> None:
        # Input seeking limits the sample. Shift video PTS for source-timed cues,
        # then reset the output timebase; full/sample use the same libass path.
        vf = f"setpts=PTS+{start}/TB,subtitles={track}:force_style='FontName=DejaVu Sans,FontSize=16',setpts=PTS-STARTPTS"
        run(base + ["-ss", str(start), "-i", "source.mkv", "-t", str(duration),
                    "-vf", vf, "-af", "asetpts=PTS-STARTPTS", "-map", "0:v:0", "-map", "0:a:0",
                    "-c:v", "ffv1", "-level", "3", "-c:a", "flac", filename], out)

    render("full.mkv", 0, 12, "cues.srt")
    render("sample.mkv", 4, 4, "cues.srt")
    sample_hashes = frame_hashes("sample.mkv", out)
    full_hashes = frame_hashes("full.mkv", out, 4)
    changed = list(cues)
    changed[1] = (4500, 7500, "Nội dung đã sửa: máy hút bụi.")
    write_fixture("edited.srt", changed)
    render("sample-edited.mkv", 4, 4, "edited.srt")
    edited_hashes = frame_hashes("sample-edited.mkv", out)
    sample_info = probe("sample.mkv", out)
    full_info = probe("full.mkv", out)
    roundtrip = (out / "roundtrip.srt").read_text(encoding="utf-8")
    checks = {
        "unicode_caption_text_survives_srt_ass_srt": all(t in roundtrip for _, _, t in cues),
        "full_output_12_seconds": abs(float(full_info["format"]["duration"]) - 12) < .05,
        "sample_output_4_seconds": abs(float(sample_info["format"]["duration"]) - 4) < .05,
        "sample_has_audio_and_video": {s["codec_type"] for s in sample_info["streams"]} >= {"audio", "video"},
        "sample_has_120_frames": len(sample_hashes) == 120,
        "sample_matches_same_120_frames_of_full_output": sample_hashes == full_hashes,
        "subtitle_text_timing_edit_changes_sample_frames": sample_hashes != edited_hashes,
        "source_file_is_unchanged": source_hash == hashlib.sha256((out / "source.mkv").read_bytes()).hexdigest(),
    }
    result = {
        "scope": "Native FFmpeg/libass foundation only, not a complete integration or performance benchmark",
        "environment": {"platform": platform.platform(), "machine": platform.machine(),
                        "python": sys.version.split()[0], "ffmpeg_version": info.splitlines()[0],
                        "ffmpeg_build_configuration": next((s for s in info.splitlines() if s.startswith("configuration:")), "")},
        "fixture": {"origin": "locally generated testsrc2 + sine", "resolution": "320x180", "fps": 30,
                    "full_seconds": 12, "sample_source_interval_seconds": [4, 8],
                    "encoding": "FFV1/FLAC lossless to isolate frame comparison", "font": "existing system DejaVu Sans; not bundled"},
        "checks": checks, "passed": sum(checks.values()), "total": len(checks),
        "not_tested": ["Electron/React timeline", "JASSUB/wavesurfer", "pysubs2/PyAV",
                       "OCR/RapidOCR", "LaMa/ONNX inference", "temporal inpainting", "AI quality",
                       "macOS/Windows packaging", "GPU performance", "5-minute or 1080p performance",
                       "VFR/HDR/rotation/multiple clips", "interactive content editing", "billing or publishing"],
        "limitations": ["Changed SRT fixture programmatically, not through an implemented editing UI.",
                        "Eight passing checks do not validate excluded components or performance.",
                        "System FFmpeg was used, not redistributed; its GPL-enabled configuration is not the app distribution choice."]
    }
    (out / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "full-frame-hashes.txt").write_text("\n".join(full_hashes)+"\n")
    (out / "sample-frame-hashes.txt").write_text("\n".join(sample_hashes)+"\n")
    print(json.dumps({"passed": result["passed"], "total": result["total"], "checks": checks}, indent=2))
    if not all(checks.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
