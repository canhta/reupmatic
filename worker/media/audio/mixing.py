from media.editing.filters import audio_filters


def soundtrack_filters(track, output_start_ms, duration_ms):
    clip = (track["end_ms"] - track["start_ms"]) / 1000
    filters = ["aresample=48000:async=1:first_pts=0",
               "aformat=sample_fmts=fltp:channel_layouts=stereo",
               f'atrim=start={track["start_ms"] / 1000:.3f}:end={track["end_ms"] / 1000:.3f}',
               "asetpts=PTS-STARTPTS", f'volume={track["gain_db"]}dB']
    if track["fade_in_ms"]:
        filters.append(f'afade=t=in:st=0:d={track["fade_in_ms"] / 1000:.3f}')
    if track["fade_out_ms"]:
        fade = track["fade_out_ms"] / 1000
        filters.append(f"afade=t=out:st={clip - fade:.3f}:d={fade:.3f}")
    filters += [f'adelay={track["offset_ms"]}:all=1', "apad",
                f"atrim=start={output_start_ms / 1000:.3f}:end={(output_start_ms + duration_ms) / 1000:.3f}",
                "asetpts=PTS-STARTPTS"]
    return filters


def audio_arguments(source_index, track_index, track, has_source, edit, start, end, duration, source_offset_ms=0):
    speed = edit.get("speed", 1)
    original = has_source and not edit.get("audio", {}).get("muted", False)
    if not track:
        if not original:
            return ["-an"]
        return ["-map", f"{source_index}:a:0", "-af", ",".join(
            audio_filters(start - source_offset_ms, end - source_offset_ms, speed, edit.get("audio", {}), duration))]
    output_start = round((start - edit.get("trim", {}).get("start_ms", 0)) / speed)
    graph = [f"[{track_index}:a:0]" + ",".join(soundtrack_filters(track, output_start, duration)) + "[music]"]
    if original and track["mode"] == "mix":
        filters = audio_filters(start - source_offset_ms, end - source_offset_ms, speed, edit.get("audio", {}), duration)
        filters += ["aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo"]
        graph += [f"[{source_index}:a:0]" + ",".join(filters) + "[original]",
                  "[original][music]amix=inputs=2:duration=longest:normalize=0:dropout_transition=0[mixed]"]
        label = "mixed"
    else:
        label = "music"
    graph.append(f"[{label}]alimiter=limit=0.95:level=false:latency=true[audio]")
    return ["-filter_complex_threads", "2", "-filter_complex", ";".join(graph), "-map", "[audio]"]
