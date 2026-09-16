import math

from runtime.errors import WorkerError


def geometry_filters(edit, info):
    width, height = info["width"], info["height"]
    filters = ["scale=2*trunc(iw*sar/2):2*trunc(ih/2)", "setsar=1"]
    width, height = even(width), even(height)
    if crop := edit.get("crop"):
        left = min(width - 2, math.floor(crop["x"] * width / 2) * 2)
        top = min(height - 2, math.floor(crop["y"] * height / 2) * 2)
        width = min(width - left, even(width * crop["width"]))
        height = min(height - top, even(height * crop["height"]))
        filters.append(f"crop={width}:{height}:{left}:{top}")
    if edit.get("flip") in ("horizontal", "both"):
        filters.append("hflip")
    if edit.get("flip") in ("vertical", "both"):
        filters.append("vflip")
    if color := edit.get("color"):
        filters.append(f'eq=brightness={color["brightness"]}:contrast={color["contrast"]}:saturation={color["saturation"]}')
    if output := edit.get("output"):
        aspect = output["aspect"]
        ratio = width / height
        if aspect != "source":
            numerator, denominator = map(int, aspect.split(":"))
            ratio = numerator / denominator
        target_height = output["height"] or height
        target_width = even(target_height * ratio)
        if max(target_width, target_height) > 8192:
            raise WorkerError("EDIT_OUTPUT_SIZE")
        if output["fit"] == "contain":
            filters += [f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease:force_divisible_by=2",
                        f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2"]
        else:
            filters += [f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase:force_divisible_by=2",
                        f"crop={target_width}:{target_height}:(iw-ow)/2:(ih-oh)/2"]
        width, height = target_width, target_height
    filters.append("setsar=1")
    return filters, (width, height)


def even(value):
    return max(2, math.floor(value / 2) * 2)


def audio_filters(start_ms, end_ms, speed, audio, duration_ms):
    filters = ["aresample=async=1:first_pts=0", f"atrim=start={start_ms / 1000:.3f}:end={end_ms / 1000:.3f}",
               "asetpts=PTS-STARTPTS"]
    remaining = speed
    while remaining < 0.5:
        filters.append("atempo=0.5")
        remaining /= 0.5
    while remaining > 2:
        filters.append("atempo=2")
        remaining /= 2
    if remaining != 1:
        filters.append(f"atempo={remaining:.9f}")
    if audio.get("gain_db", 0):
        filters.append(f'volume={audio["gain_db"]}dB')
    filters += ["apad", f"atrim=duration={duration_ms / 1000:.3f}"]
    return filters
