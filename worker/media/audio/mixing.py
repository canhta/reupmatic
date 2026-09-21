from media.editing.filters import audio_fade_filters, audio_filters

# The mix bus every branch is resampled onto before they are summed. A voice recording's own rate
# is used for its placement and trim, never assumed to be this.
MIX_RATE = 48000

# Ducking is one fixed-ratio `sidechaincompress` whose threshold is derived from the two user
# settings. The filter has no output-range control, so the requested amount is expressed through
# the threshold instead: at ratio 8, a sidechain at the documented -18 dBFS speech reference loses
# exactly `amount_db`, and louder speech ducks proportionally more. The attack is fixed so speech
# is caught quickly; release is the user's. The derivation lives only here.
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
        # Bounded, not unbounded: two unbounded pads feeding one amix never reach EOF, so each
        # branch is padded to the exact output window before the final trim rather than forever.
        f"apad=whole_dur={(output_start_ms + duration_ms) / 1000:.6f}",
        f"atrim=start={output_start_ms / 1000:.3f}:end={(output_start_ms + duration_ms) / 1000:.3f}",
        "asetpts=PTS-STARTPTS",
    ]
    return filters


def voice_filters(voice_index, voice, output_start_ms, duration_ms):
    """The third branch: each planned line lifted out of the recording at its own span and paced
    onto the output clock, then the combined track levelled and faded.

    A line is trimmed by its frame span over the recording's own reported rate, so the producer's
    inter-line silence and lead padding are never placed. Returns the filter-graph fragments for a
    branch labeled `voice`, which sits on the same 0-based window as the music branch.
    """
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
        # Unity is not a rate factor: the plan's `1` means the line plays as produced, so no
        # atempo is emitted and the argument list says so plainly.
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


def audio_output_filters(edit, output_start_ms, sample, full_output_ms, apply_fades):
    """Fades on the full OUTPUT clock, then trim to a fade-corrected sample.

    The mixed bus is 0-based over the render window; `output_start_ms` shifts it
    onto the full output clock so `afade` sits at the true head/tail, and a sample
    is trimmed back to its requested output window. A full render or an unfaded
    sample needs only the fade stage (or nothing).
    """
    if not sample:
        return audio_fade_filters(edit, full_output_ms) if apply_fades else []
    filters = []
    if output_start_ms:
        filters.append(f"asetpts=PTS+{output_start_ms / 1000:.6f}/TB")
    filters += audio_fade_filters(edit, full_output_ms)
    filters += [
        f"atrim=start={sample[0] / 1000:.3f}:end={sample[1] / 1000:.3f}",
        "asetpts=PTS-STARTPTS",
    ]
    return filters


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
    sample=None,
    full_output_ms=None,
    apply_fades=True,
):
    """The mixed audio as one of three shapes, so a video `filter_complex` can merge it.

    Returns `{"kind": "silent"}`, `{"kind": "simple", "filters": [...]}` (one
    `-af`-equivalent chain on the source's own audio) or `{"kind": "complex",
    "graph": ..., "label": ...}` for the soundtrack/voice branches, ducking
    included. `audio_arguments` is the standalone `-af`/`-filter_complex` form.
    """
    speed = edit.get("speed", 1)
    original = has_source and not edit.get("audio", {}).get("muted", False)
    tail = audio_output_filters(
        edit, output_start_ms, sample, full_output_ms or duration, apply_fades
    )
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
    # A layer that replaces suppresses the source; either the music or the voice declaring
    # "replace" drops original audio, and the two still sum together rather than one displacing
    # the other.
    original_present = (
        original
        and not (track and track["mode"] == "replace")
        and not (voice and voice["mode"] == "replace")
    )
    # `duck` is a required field of the one current soundtrack shape; read it strictly so a track
    # missing it fails loudly rather than being silently treated as ducking off.
    key = None
    if track and track["duck"]["enabled"] and track["duck"]["amount_db"] > 0:
        # Keyed by the voice track when there is one, otherwise by the original audio. With neither
        # (muted source, no voice) there is nothing to key on, so the music is left alone.
        key = "voice" if voice else ("original" if original_present else None)
    ducking = key is not None
    # The music branch keeps its raw label until the sidechain compressor names the ducked output
    # `music`, which the summing stage then consumes as before.
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
        # The key is split: one copy still sums into the mix, the other drives the compressor.
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
    sample=None,
    full_output_ms=None,
    apply_fades=True,
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
        sample,
        full_output_ms,
        apply_fades,
    )
    return audio_arguments_from(result, source_index)
