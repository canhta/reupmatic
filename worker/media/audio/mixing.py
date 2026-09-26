from media.editing.filters import audio_fade_filters, audio_filters

MIX_RATE = 48000

# Threshold derived so a -18 dBFS sidechain loses exactly `amount_db` at ratio 8.
DUCK_RATIO = 8.0
DUCK_ATTACK_MS = 20.0
DUCK_REFERENCE_DBFS = -18.0
DUCK_THRESHOLD_MIN = 0.000976563


def duck_parameters(amount_db, release_ms):
    threshold_db = DUCK_REFERENCE_DBFS - amount_db / (1 - 1 / DUCK_RATIO)
    threshold = min(1.0, max(DUCK_THRESHOLD_MIN, 10 ** (threshold_db / 20)))
    return {
        "threshold": threshold,
        "ratio": DUCK_RATIO,
        "attack": DUCK_ATTACK_MS,
        "release": release_ms,
    }


def duck_filter(amount_db, release_ms):
    p = duck_parameters(amount_db, release_ms)
    return (
        f"sidechaincompress=threshold={p['threshold']:.9f}:ratio={p['ratio']:g}"
        f":attack={p['attack']:g}:release={p['release']:g}"
    )


def soundtrack_filters(track, output_start_ms, duration_ms):
    clip = (track["end_ms"] - track["start_ms"]) / 1000
    filters = [
        f"aresample={MIX_RATE}:async=1:first_pts=0",
        "aformat=sample_fmts=fltp:channel_layouts=stereo",
        f"atrim=start={track['start_ms'] / 1000:.3f}:end={track['end_ms'] / 1000:.3f}",
        "asetpts=PTS-STARTPTS",
        f"volume={track['gain_db']}dB",
    ]
    if track["fade_in_ms"]:
        filters.append(f"afade=t=in:st=0:d={track['fade_in_ms'] / 1000:.3f}")
    if track["fade_out_ms"]:
        fade = track["fade_out_ms"] / 1000
        filters.append(f"afade=t=out:st={clip - fade:.3f}:d={fade:.3f}")
    filters += [
        f"adelay={track['offset_ms']}:all=1",
        # Two unbounded apads feeding one amix never reach EOF; pad to the exact window.
        f"apad=whole_dur={(output_start_ms + duration_ms) / 1000:.6f}",
        f"atrim=start={output_start_ms / 1000:.3f}:end={(output_start_ms + duration_ms) / 1000:.3f}",
        "asetpts=PTS-STARTPTS",
    ]
    return filters


def voice_filters(voice_index, voice, output_start_ms, duration_ms):
    """Each planned line lifted out of the recording and paced onto the output clock."""
    sample_rate = voice["sample_rate"]
    lines = voice["lines"]
    graph = []
    head = [f"aresample={MIX_RATE}", "aformat=sample_fmts=fltp:channel_layouts=stereo"]
    if len(lines) > 1:
        head.append(f"asplit={len(lines)}")
        graph.append(
            f"[{voice_index}:a:0]"
            + ",".join(head)
            + "".join(f"[v{index}]" for index in range(len(lines)))
        )
    else:
        graph.append(f"[{voice_index}:a:0]" + ",".join(head) + "[v0]")
    first_ms = None
    last_end_ms = 0
    slices = []
    for index, line in enumerate(lines):
        start_s = line["start_frame"] / sample_rate
        end_s = line["end_frame"] / sample_rate
        filters = [
            f"atrim=start={start_s:.9f}:end={end_s:.9f}",
            "asetpts=PTS-STARTPTS",
        ]
        if line["rate"] != 1:
            filters.append(f"atempo={line['rate']:.9f}")
        filters.append(f"adelay={line['offset_ms']}:all=1")
        slices.append(f"[l{index}]")
        graph.append(f"[v{index}]" + ",".join(filters) + f"[l{index}]")
        first_ms = line["offset_ms"] if first_ms is None else min(first_ms, line["offset_ms"])
        last_end_ms = max(
            last_end_ms,
            line["offset_ms"]
            + ((line["end_frame"] - line["start_frame"]) * 1000 / sample_rate) / line["rate"],
        )
    if len(lines) > 1:
        graph.append(
            "".join(slices)
            + f"amix=inputs={len(lines)}:duration=longest:normalize=0:dropout_transition=0[voice_abs]"
        )
    else:
        graph.append("[l0]anull[voice_abs]")
    tail = []
    if voice["gain_db"]:
        tail.append(f"volume={voice['gain_db']}dB")
    if voice["fade_in_ms"]:
        tail.append(f"afade=t=in:st={first_ms / 1000:.6f}:d={voice['fade_in_ms'] / 1000:.3f}")
    if voice["fade_out_ms"]:
        start = max(0, last_end_ms - voice["fade_out_ms"]) / 1000
        tail.append(f"afade=t=out:st={start:.6f}:d={voice['fade_out_ms'] / 1000:.3f}")
    tail += [
        f"apad=whole_dur={(output_start_ms + duration_ms) / 1000:.6f}",
        f"atrim=start={output_start_ms / 1000:.3f}:end={(output_start_ms + duration_ms) / 1000:.3f}",
        "asetpts=PTS-STARTPTS",
    ]
    graph.append("[voice_abs]" + ",".join(tail) + "[voice]")
    return graph


def audio_filter_graph(
    source_index,
    track_index,
    track,
    has_source,
    edit,
    start,
    end,
    duration,
    source_offset_ms=0,
    voice=None,
    voice_index=None,
    output_start_ms=0,
):
    """The mixed audio as one of three shapes for a video `filter_complex` to merge."""
    speed = edit.get("speed", 1)
    original = has_source and not edit.get("audio", {}).get("muted", False)
    tail = audio_fade_filters(edit, duration)
    if not track and not voice:
        if not original:
            return {"kind": "silent"}
        filters = audio_filters(
            start - source_offset_ms,
            end - source_offset_ms,
            speed,
            edit.get("audio", {}),
            duration,
        )
        filters += tail
        return {"kind": "simple", "filters": filters}
    original_present = (
        original
        and not (track and track["mode"] == "replace")
        and not (voice and voice["mode"] == "replace")
    )
    key = None
    if track and track["duck"]["enabled"] and track["duck"]["amount_db"] > 0:
        key = "voice" if voice else ("original" if original_present else None)
    ducking = key is not None
    music_label = "music_raw" if ducking else "music"
    graph = []
    branches = []
    if original_present:
        filters = audio_filters(
            start - source_offset_ms,
            end - source_offset_ms,
            speed,
            edit.get("audio", {}),
            duration,
        )
        filters += [f"aresample={MIX_RATE}", "aformat=sample_fmts=fltp:channel_layouts=stereo"]
        graph.append(f"[{source_index}:a:0]" + ",".join(filters) + "[original]")
        branches.append("original")
    if track:
        graph.append(
            f"[{track_index}:a:0]"
            + ",".join(soundtrack_filters(track, output_start_ms, duration))
            + f"[{music_label}]"
        )
        branches.append("music")
    if voice:
        graph += voice_filters(voice_index, voice, output_start_ms, duration)
        branches.append("voice")
    if ducking:
        graph.append(f"[{key}]asplit=2[{key}_duck_mix][{key}_duck_key]")
        graph.append(
            f"[music_raw][{key}_duck_key]"
            + duck_filter(track["duck"]["amount_db"], track["duck"]["release_ms"])
            + "[music]"
        )
        branches = [f"{key}_duck_mix" if name == key else name for name in branches]
    if len(branches) == 1:
        label = branches[0]
    else:
        inputs = "".join(f"[{name}]" for name in branches)
        graph.append(
            f"{inputs}amix=inputs={len(branches)}:duration=longest:normalize=0:dropout_transition=0"
            "[mixed]"
        )
        label = "mixed"
    tail = "," + ",".join(tail) if tail else ""
    graph.append(f"[{label}]alimiter=limit=0.95:level=false:latency=true{tail}[audio]")
    return {"kind": "complex", "graph": ";".join(graph), "label": "audio"}


def audio_arguments_from(result, source_index):
    if result["kind"] == "silent":
        return ["-an"]
    if result["kind"] == "simple":
        return ["-map", f"{source_index}:a:0", "-af", ",".join(result["filters"])]
    return [
        "-filter_complex_threads",
        "2",
        "-filter_complex",
        result["graph"],
        "-map",
        f"[{result['label']}]",
    ]


def audio_arguments(
    source_index,
    track_index,
    track,
    has_source,
    edit,
    start,
    end,
    duration,
    source_offset_ms=0,
    voice=None,
    voice_index=None,
    output_start_ms=0,
):
    result = audio_filter_graph(
        source_index,
        track_index,
        track,
        has_source,
        edit,
        start,
        end,
        duration,
        source_offset_ms,
        voice,
        voice_index,
        output_start_ms,
    )
    return audio_arguments_from(result, source_index)
