import math

from runtime.errors import WorkerError


def geometry_filters(edit, info):
    width, height = info["width"], info["height"]
    filters = ["scale=2*trunc(iw*sar/2):2*trunc(ih/2)", "setsar=1"]
    width, height = even(width), even(height)
    # Rotate first, then crop/flip in the rotated frame — the same order the
    # Source monitor's CSS transform implements (app/core/editing/geometry-preview.ts).
    rotate = edit.get("rotate", 0)
    if rotate:
        filters.append({90: "transpose=1", 180: "hflip,vflip", 270: "transpose=2"}[rotate])
        if rotate in (90, 270):
            width, height = height, width
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
        filters.append(
            f"eq=brightness={color['brightness']}:contrast={color['contrast']}:saturation={color['saturation']}"
        )
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
            filters += [
                f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease:force_divisible_by=2",
                f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2",
            ]
        else:
            filters += [
                f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase:force_divisible_by=2",
                f"crop={target_width}:{target_height}:(iw-ow)/2:(ih-oh)/2",
            ]
        width, height = target_width, target_height
    filters.append("setsar=1")
    return filters, (width, height)


def even(value):
    return max(2, math.floor(value / 2) * 2)


# The logo anchors, horizontal/vertical independently. `center` is `middle` vertically.
LOGO_AXES = {
    "top-left": ("top", "left"),
    "top-center": ("top", "center"),
    "top-right": ("top", "right"),
    "middle-left": ("middle", "left"),
    "center": ("middle", "center"),
    "middle-right": ("middle", "right"),
    "bottom-left": ("bottom", "left"),
    "bottom-center": ("bottom", "center"),
    "bottom-right": ("bottom", "right"),
}


def logo_overlay(logo, output_size):
    """The still image's placement on the OUTPUT frame, after the output scale/pad.

    Returns `(logo_filters, x, y)`: the filters that scale and fade the logo input,
    then the `overlay` x/y expressions in the output frame's own pixels. The width
    is `scale` of the output width and the height keeps the image ratio (`-2`);
    `margin` insets from the anchored edge as a fraction of the output width — the
    same convention `app/core/editing/logo-preview.ts` computes for the monitor.
    """
    out_w, _out_h = output_size
    width = max(2, round(logo["scale"] * out_w))
    margin = round(logo["margin"] * out_w)
    filters = [f"scale={width}:-2", "format=rgba"]
    if logo["opacity"] < 1:
        filters.append(f"colorchannelmixer=aa={logo['opacity']:.9f}")
    vertical, horizontal = LOGO_AXES[logo["anchor"]]
    x = {
        "left": str(margin),
        "center": "(main_w-overlay_w)/2",
        "right": f"main_w-overlay_w-{margin}",
    }[horizontal]
    y = {
        "top": str(margin),
        "middle": "(main_h-overlay_h)/2",
        "bottom": f"main_h-overlay_h-{margin}",
    }[vertical]
    return filters, x, y


def video_fade_filters(edit, duration_ms):
    """Head/tail `fade` on the OUTPUT clock: after trim/speed, so output duration is unchanged.

    `fade=t=in` starts at 0; `fade=t=out` starts `out` before the end. The recipe
    rejects an in+out pair longer than the window, and the caller only emits a
    fade whose duration fits the window, so the two ramps never overlap.
    """
    fade = edit.get("fade")
    if not fade:
        return []
    duration = duration_ms / 1000
    filters = []
    if fade["in_ms"]:
        filters.append(f"fade=t=in:st=0:d={fade['in_ms'] / 1000:.3f}")
    if fade["out_ms"]:
        start = max(0.0, duration - fade["out_ms"] / 1000)
        filters.append(f"fade=t=out:st={start:.3f}:d={fade['out_ms'] / 1000:.3f}")
    return filters


def audio_fade_filters(edit, duration_ms):
    """The `afade` counterpart of `video_fade_filters`, emitted only when `fade.audio` is set."""
    fade = edit.get("fade")
    if not fade or not fade.get("audio"):
        return []
    duration = duration_ms / 1000
    filters = []
    if fade["in_ms"]:
        filters.append(f"afade=t=in:st=0:d={fade['in_ms'] / 1000:.3f}")
    if fade["out_ms"]:
        start = max(0.0, duration - fade["out_ms"] / 1000)
        filters.append(f"afade=t=out:st={start:.3f}:d={fade['out_ms'] / 1000:.3f}")
    return filters


def audio_filters(start_ms, end_ms, speed, audio, duration_ms):
    filters = [
        "aresample=async=1:first_pts=0",
        f"atrim=start={start_ms / 1000:.3f}:end={end_ms / 1000:.3f}",
        "asetpts=PTS-STARTPTS",
    ]
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
        filters.append(f"volume={audio['gain_db']}dB")
    filters += ["apad", f"atrim=duration={duration_ms / 1000:.3f}"]
    return filters
