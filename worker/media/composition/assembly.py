"""Bounded montage assembly feeding the existing media encoder, not a second queue."""

import math
import shutil
import tempfile
from pathlib import Path

from media.cache import RenderCache
from media.editing.filters import audio_filters, geometry_filters
from media.probe import probe_file
from runtime.errors import WorkerError


def verify_sources(host, req, document):
    checked = {}
    for clip in document["clips"]:
        source = clip["source"]
        key = (source["asset_id"], source["sha256"])
        if key in checked:
            if checked[key] != source["duration_ms"]:
                raise WorkerError("SOURCE_CHANGED")
            continue
        asset = host.assets.verify(source["asset_id"], "video", lambda: host.cancelled(req))
        if asset["sha256"] != source["sha256"]:
            raise WorkerError("SOURCE_CHANGED")
        duration = probe_file(host, req, asset["path"])["duration_ms"]
        if duration != source["duration_ms"]:
            raise WorkerError("SOURCE_CHANGED")
        checked[key] = duration


def assemble(host, req, document, spans, window):
    verify_sources(host, req, document)
    recipe = {
        "schema": 1,
        "renderer": "composition-0.12.0",
        "canvas": document["canvas"],
        "clips": [
            {
                **span["clip"],
                "source": {
                    key: value for key, value in span["clip"]["source"].items() if key != "asset_id"
                },
            }
            for span in spans
        ],
        "start_ms": window["start_ms"],
        "end_ms": window["end_ms"],
        "runtime": host.runtime_identity,
    }
    cache = RenderCache(host, recipe, ".mkv")
    cached = cache.read(req)
    if cached:
        verify_sources(host, req, document)
        return cached
    with tempfile.TemporaryDirectory(dir=host.workspace, prefix="composition-") as directory:
        staging = Path(directory)
        if shutil.disk_usage(staging).free < 64 * 1024**2:
            raise WorkerError("COMPOSITION_DISK_LOW")
        output = staging / "montage.mkv"
        args, duration_ms = assembly_arguments(host, req, document, spans, window, output)
        host.emit(req, "progress", {"phase": "compositionEncoding", "fraction": None})
        host.process.run(req, args, cwd=staging, duration_ms=duration_ms)
        media = probe_file(host, req, output)
        if abs(media["duration_ms"] - duration_ms) > 50 or not media["has_audio"]:
            raise WorkerError("OUTPUT_DURATION")
        verify_sources(host, req, document)
        return cache.publish(req, output, media)


def assembly_arguments(host, req, document, spans, window, output):
    canvas = document["canvas"]
    fps = canvas["fps"]
    args = [host.ffmpeg, "-v", "error", "-nostdin", "-filter_complex_threads", "2"]
    graph, labels, segment, input_index, infos = [], [], 0, 0, {}
    first, last = window["start_ms"], window["end_ms"]
    total_frames = math.floor((last - first) * fps / 1000 + 0.5)
    if not total_frames:
        raise WorkerError("COMPOSITION_SAMPLE_SHORT")
    for span in spans:
        start, end = max(first, span["start_ms"]), min(last, span["end_ms"])
        if end <= start:
            continue
        frame_start = math.floor((start - first) * fps / 1000 + 0.5)
        frame_end = math.floor((end - first) * fps / 1000 + 0.5)
        frames = frame_end - frame_start
        if not frames:
            continue
        clip = span["clip"]
        duration = frames / fps
        # A disabled clip keeps its place on the clock but contributes black and silence.
        if not clip["enabled"]:
            graph.append(
                f"color=c=black:s={canvas['width']}x{canvas['height']}:r={fps}:d={duration:.9f},"
                "format=yuv420p,setsar=1,"
                f"trim=end_frame={frames},settb=AVTB,setpts=PTS-STARTPTS[v{segment}]"
            )
            graph.append(
                f"anullsrc=r=48000:cl=stereo,atrim=end_sample={frames * 1600},"
                f"asetpts=PTS-STARTPTS[a{segment}]"
            )
            labels.append(f"[v{segment}][a{segment}]")
            segment += 1
            continue
        source = host.assets.get(clip["source"]["asset_id"], "video")
        if source["sha256"] not in infos:
            infos[source["sha256"]] = probe_file(host, req, source["path"])
        info = infos[source["sha256"]]
        if info["duration_ms"] != clip["source"]["duration_ms"]:
            raise WorkerError("SOURCE_CHANGED")
        seek = clip["start_ms"] + (start - span["start_ms"]) * clip["speed"]
        source_length = min(clip["end_ms"] - seek, (end - start) * clip["speed"])
        args += [
            "-threads",
            "2",
            "-ss",
            f"{seek / 1000:.9f}",
            "-t",
            f"{source_length / 1000:.9f}",
            "-i",
            str(source["path"]),
        ]
        video, _ = geometry_filters({}, info)
        video += [
            f"scale={canvas['width']}:{canvas['height']}:force_original_aspect_ratio=decrease:force_divisible_by=2",
            f"pad={canvas['width']}:{canvas['height']}:(ow-iw)/2:(oh-ih)/2",
            "setsar=1",
            f"setpts=(PTS-STARTPTS)/{clip['speed']:.9f}",
            f"fps={fps}",
            f"tpad=stop_mode=clone:stop_duration={duration:.9f}",
            f"trim=end_frame={frames}",
            "settb=AVTB",
            "setpts=PTS-STARTPTS",
            "format=yuv420p",
        ]
        graph.append(f"[{input_index}:v:0]" + ",".join(video) + f"[v{segment}]")
        if info["has_audio"]:
            audio = audio_filters(0, source_length, clip["speed"], {}, duration * 1000)
            audio += [
                "aresample=48000",
                "aformat=sample_fmts=fltp:channel_layouts=stereo",
                "apad",
                f"atrim=end_sample={frames * 1600}",
                "asetpts=PTS-STARTPTS",
            ]
            graph.append(f"[{input_index}:a:0]" + ",".join(audio) + f"[a{segment}]")
        else:
            graph.append(
                f"anullsrc=r=48000:cl=stereo,atrim=end_sample={frames * 1600},asetpts=PTS-STARTPTS[a{segment}]"
            )
        labels.append(f"[v{segment}][a{segment}]")
        segment += 1
        input_index += 1
    graph.append("".join(labels) + f"concat=n={segment}:v=1:a=1[video][audio]")
    args += [
        "-filter_complex",
        ";".join(graph),
        "-map",
        "[video]",
        "-map",
        "[audio]",
        "-c:v",
        "ffv1",
        "-level",
        "3",
        "-pix_fmt",
        "yuv420p",
        "-r",
        str(fps),
        "-c:a",
        "flac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-map_metadata",
        "-1",
        "-threads",
        "2",
        "-t",
        f"{total_frames / fps:.9f}",
        "-n",
        str(output),
    ]
    return args, round(total_frames * 1000 / fps)
