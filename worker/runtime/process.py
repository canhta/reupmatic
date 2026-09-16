import hashlib
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Callable

from runtime.errors import WorkerError
from runtime.protocol import MAX_LINE


def runtime_identity(ffmpeg: str) -> str:
    try:
        result = subprocess.run([ffmpeg, "-version"], capture_output=True, timeout=10, check=True)
        return hashlib.sha256(result.stdout).hexdigest()
    except (OSError, subprocess.SubprocessError):
        return "unavailable"


class ProcessRunner:
    def __init__(self, cancelled: Callable[[dict], None]):
        self.cancelled = cancelled
        self.lock = threading.Lock()
        self.active_process: tuple[str, subprocess.Popen] | None = None

    def cancel(self, request_id: str | None = None) -> None:
        with self.lock:
            active = self.active_process
            if active and (request_id is None or active[0] == request_id):
                try:
                    active[1].terminate()
                except OSError:
                    pass

    def run(self, req: dict, args: list[str], *, cwd: Path | None = None,
                    duration_ms: int | None = None, timeout: float = 3600,
                    on_poll: Callable[[], None] | None = None) -> bytes:
            """Execute a native tool without a shell; cancellation is independently polled."""
            self.cancelled(req)
            with tempfile.TemporaryFile() as errors, tempfile.TemporaryFile() as output:
                try:
                    proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=output, stderr=errors, cwd=cwd)
                except FileNotFoundError:
                    raise WorkerError("COMPONENT_MISSING")
                with self.lock:
                    self.active_process = (req["id"], proc)
                started = time.monotonic()
                try:
                    while proc.poll() is None:
                        self.cancelled(req)
                        if on_poll:
                            on_poll()
                        if time.monotonic() - started > timeout:
                            raise WorkerError("TOOL_TIMEOUT")
                        time.sleep(0.025)
                    self.cancelled(req)
                    if proc.returncode:
                        raise WorkerError("TOOL_FAILED")
                    output.seek(0)
                    return output.read(MAX_LINE * 8)
                finally:
                    if proc.poll() is None:
                        proc.terminate()
                        try:
                            proc.wait(timeout=3)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                            proc.wait(timeout=3)
                    with self.lock:
                        self.active_process = None
