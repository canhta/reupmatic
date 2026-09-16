import math
import sys
import tempfile
from pathlib import Path

from media.probe import probe_file
from runtime.context import WorkerContext
from runtime.errors import WorkerError
from runtime.protocol import exact

def peaks(host: WorkerContext, req: dict) -> dict:
        import array
        p = exact(req["params"], {"asset_id"})
        asset = host.assets.get(p["asset_id"], "video")
        info = probe_file(host, req, asset["path"])
        if not info["has_audio"]:
            return {"peaks": [], "duration_ms": info["duration_ms"]}
        if info["duration_ms"] > 3600 * 1000:
            raise WorkerError("EXERCISE_LIMIT")
        with tempfile.TemporaryDirectory(dir=host.workspace, prefix="peaks-") as tmp:
            pcm = Path(tmp) / "audio.pcm"
            host.process.run(req, [host.ffmpeg, "-v", "error", "-nostdin", "-i", str(asset["path"]), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "2000", "-f", "s16le", "-n", str(pcm)])
            block = max(1, math.ceil(pcm.stat().st_size / 2 / 1000))
            peaks: list[float] = []
            with pcm.open("rb") as stream:
                while data := stream.read(block * 2):
                    host.cancelled(req)
                    values = array.array("h", data)
                    if sys.byteorder != "little":
                        values.byteswap()
                    peaks.append(max((abs(v) for v in values), default=0) / 32768)
            host.assets.get(p["asset_id"])
            return {"peaks": peaks, "duration_ms": info["duration_ms"]}
