import argparse
import json
import os
import sys
from pathlib import Path

from runtime.protocol import MAX_LINE
from runtime.worker import Worker


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_PATH", "ffmpeg"))
    parser.add_argument("--ffprobe", default=os.environ.get("FFPROBE_PATH", "ffprobe"))
    args = parser.parse_args()
    worker = Worker(args.workspace, args.ffmpeg, args.ffprobe)
    try:
        while line := sys.stdin.buffer.readline(MAX_LINE + 1):
            if len(line) > MAX_LINE:
                worker.emit(
                    {"id": "invalid", "revision": 0}, "error", {"code": "PAYLOAD_TOO_LARGE"}
                )
                break
            try:
                req = json.loads(
                    line.decode("utf-8"),
                    parse_constant=lambda _: (_ for _ in ()).throw(ValueError()),
                )
            except (ValueError, UnicodeDecodeError):
                worker.emit({"id": "invalid", "revision": 0}, "error", {"code": "INVALID_REQUEST"})
                continue
            worker.accept(req)
    finally:
        worker.close()


if __name__ == "__main__":
    main()
