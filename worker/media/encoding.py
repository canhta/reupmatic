import shutil
from pathlib import Path

from media.editing.filters import geometry_filters
from media.audio.mixing import audio_arguments
from subtitles.document import style_srt
from media.editing.recipe import parse_editing
from media.probe import probe_file


def encode_video(host, req, source: Path, output: Path, *, start_ms: int, end_ms: int,
                 encoding: str, subtitle: Path | None = None, video_track: Path | None = None,
                 editing: dict | None = None, soundtrack: dict | None = None, subtitle_style: dict | None = None,
                 source_offset_ms: int = 0):
    edit = parse_editing(editing) if editing is not None else {}
    speed = edit.get("speed", 1)
    duration_ms = max(1, int((end_ms - start_ms) / speed + 0.5))
    source_info = probe_file(host, req, source)
    video_info = probe_file(host, req, video_track) if video_track else source_info
    working = output.parent
    args = [host.ffmpeg, "-v", "error", "-nostdin", "-threads", "2", "-filter_threads", "2"]
    args += ["-i", str(video_track or source)]
    if video_track:
        args += ["-i", str(source)]
    track_index = 2 if video_track else 1
    if soundtrack:
        args += ["-i", str(soundtrack["path"])]
    args += ["-map", "0:v:0"]
    args += audio_arguments(1 if video_track else 0, track_index, soundtrack,
                            source_info["has_audio"], edit, start_ms, end_ms, duration_ms, source_offset_ms)
    filters = ["setpts=PTS-STARTPTS"]
    if video_track:
        filters += [f"setpts=PTS+{start_ms / 1000:.6f}/TB"]
    else:
        filters += [f"trim=start={(start_ms - source_offset_ms) / 1000:.3f}:end={(end_ms - source_offset_ms) / 1000:.3f}"]
    if source_offset_ms:
        filters += [f"setpts=PTS+{source_offset_ms / 1000:.6f}/TB"]
    geometry, dimensions = geometry_filters(edit, video_info)
    filters += geometry
    if subtitle:
        if subtitle.suffix.lower() == ".srt" and subtitle_style:
            track = working / "track.ass"
            style_srt(subtitle, track, subtitle_style, dimensions)
        else:
            track = working / ("track.ass" if subtitle.suffix.lower() == ".ass" else "track.srt")
            if subtitle.resolve() != track.resolve():
                shutil.copyfile(subtitle, track)
        filters += [f"subtitles={track.name}"]
    # Subtitle times belong to the source. Burn before changing the playback clock.
    filters += [f"setpts=(PTS-STARTPTS)/{speed:.9f}"]
    args += ["-vf", ",".join(filters), "-t", f"{duration_ms / 1000:.3f}", "-map_metadata", "-1"]
    if encoding == "lossless":
        args += ["-c:v", "ffv1", "-level", "3", "-c:a", "flac"]
    else:
        args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-movflags", "+faststart"]
    args += ["-r", video_info["frame_rate"], "-threads", "2", "-n", str(output)]
    host.process.run(req, args, cwd=working, duration_ms=duration_ms)
