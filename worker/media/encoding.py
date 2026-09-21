import shutil
from pathlib import Path

from subtitles.document import style_srt

from media.audio.mixing import audio_arguments_from, audio_filter_graph
from media.editing.filters import geometry_filters, logo_overlay, video_fade_filters
from media.editing.recipe import parse_editing
from media.probe import probe_file


def encode_video(
    host,
    req,
    source: Path,
    output: Path,
    *,
    start_ms: int,
    end_ms: int,
    encoding: str,
    subtitle: Path | None = None,
    video_track: Path | None = None,
    editing: dict | None = None,
    soundtrack: dict | None = None,
    voice: dict | None = None,
    logo: Path | None = None,
    subtitle_style: dict | None = None,
    source_offset_ms: int = 0,
    apply_fades: bool = True,
    sample: tuple[int, int] | None = None,
    full_output_ms: int | None = None,
):
    edit = parse_editing(editing) if editing is not None else {}
    speed = edit.get("speed", 1)
    render_ms = max(1, int((end_ms - start_ms) / speed + 0.5))
    # A fade-corrected sample is decoded from the fade's start and trimmed back to
    # the requested window on the output clock, so the sample's frames match the
    # full render exactly (worker/media/editing/recipe.py:resolve_fade_window).
    output_ms = (sample[1] - sample[0]) if sample else render_ms
    full_ms = full_output_ms or render_ms
    trim_start = edit["trim"]["start_ms"] if "trim" in edit else 0
    output_start = max(0, int((start_ms - trim_start) / speed + 0.5))
    source_info = probe_file(host, req, source)
    video_info = probe_file(host, req, video_track) if video_track else source_info
    working = output.parent
    args = [host.ffmpeg, "-v", "error", "-nostdin", "-threads", "2", "-filter_threads", "2"]
    args += ["-i", str(video_track or source)]
    if video_track:
        args += ["-i", str(source)]
    source_index = 1 if video_track else 0
    next_index = source_index + 1
    track_index = None
    if soundtrack:
        track_index = next_index
        next_index += 1
        args += ["-i", str(soundtrack["path"])]
    voice_index = None
    if voice:
        voice_index = next_index
        args += ["-i", str(voice["path"])]
    # The logo is a second video input, overlaid after the output scale/pad so its
    # placement is expressed in output pixels (worker/media/editing/filters.py).
    logo_index = None
    if logo is not None and "logo" in edit:
        logo_index = next_index
        next_index += 1
        args += ["-i", str(logo)]
    filters = ["setpts=PTS-STARTPTS"]
    if video_track:
        filters += [f"setpts=PTS+{start_ms / 1000:.6f}/TB"]
    else:
        filters += [
            f"trim=start={(start_ms - source_offset_ms) / 1000:.3f}:end={(end_ms - source_offset_ms) / 1000:.3f}"
        ]
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
    # Fades belong to the OUTPUT clock: after the speed remap, so the output
    # duration is unchanged and the ramps sit at the true head and tail. A
    # fade-corrected sample shifts onto that same clock, fades, then trims back
    # to its requested window.
    if sample:
        filters += [f"setpts=PTS+{output_start / 1000:.6f}/TB"]
        filters += video_fade_filters(edit, full_ms)
        filters += [
            f"trim=start={sample[0] / 1000:.3f}:end={sample[1] / 1000:.3f}",
            "setpts=PTS-STARTPTS",
        ]
    elif apply_fades:
        filters += video_fade_filters(edit, render_ms)
    audio = audio_filter_graph(
        source_index,
        track_index,
        soundtrack,
        source_info["has_audio"],
        edit,
        start_ms,
        end_ms,
        render_ms,
        source_offset_ms,
        voice,
        voice_index,
        output_start_ms=output_start,
        sample=sample,
        full_output_ms=full_ms,
        apply_fades=apply_fades,
    )
    if logo_index is not None:
        # One filter_complex carries both the video overlay and the audio graph: FFmpeg
        # accepts only one, and `-vf` cannot see a second input.
        logo_filters, logo_x, logo_y = logo_overlay(edit["logo"], dimensions)
        graph = (
            f"[0:v]{','.join(filters)}[vbase];"
            f"[{logo_index}:v]{','.join(logo_filters)}[logo];"
            f"[vbase][logo]overlay={logo_x}:{logo_y}:format=auto[vout]"
        )
        maps = ["-map", "[vout]"]
        if audio["kind"] == "silent":
            maps += ["-an"]
        elif audio["kind"] == "complex":
            graph += ";" + audio["graph"]
            maps += ["-map", f"[{audio['label']}]"]
        else:
            graph += f";[{source_index}:a:0]{','.join(audio['filters'])}[audio]"
            maps += ["-map", "[audio]"]
        args += ["-filter_complex_threads", "2", "-filter_complex", graph, *maps]
    else:
        args += ["-map", "0:v:0"]
        args += audio_arguments_from(audio, source_index)
        args += ["-vf", ",".join(filters)]
    args += ["-t", f"{output_ms / 1000:.3f}", "-map_metadata", "-1"]
    if encoding == "lossless":
        args += ["-c:v", "ffv1", "-level", "3", "-c:a", "flac"]
    else:
        args += [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
        ]
    args += ["-r", video_info["frame_rate"], "-threads", "2", "-n", str(output)]
    host.process.run(req, args, cwd=working, duration_ms=output_ms)
