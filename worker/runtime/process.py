import hashlib
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable

from runtime import diagnostics
from runtime.errors import WorkerError
from runtime.protocol import MAX_LINE

# How much of a failed tool's own stderr is folded into the parent's Diagnostic record. FFmpeg
# puts the actual reason in its last few lines; the banner above it is noise.
TOOL_DETAIL_BYTES = 4096
TOOL_DETAIL_LINES = 6


def tool_detail(errors: Any) -> str:
    """The tail of a failed native tool's stderr, so `TOOL_FAILED` finally says why it failed.

    Never the whole stream and never stdout: the tool's output can be media bytes, and its
    banner is noise. The host sink still redacts what comes back.
    """
    try:
        errors.seek(0, os.SEEK_END)
        size = errors.tell()
        errors.seek(max(0, size - TOOL_DETAIL_BYTES))
        tail = errors.read().decode("utf-8", "replace")
    except (OSError, ValueError):
        return ""
    lines = [line.strip() for line in tail.splitlines() if line.strip()]
    return " | ".join(lines[-TOOL_DETAIL_LINES:])


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

    def run(
        self,
        req: dict,
        args: list[str],
        *,
        cwd: Path | None = None,
        duration_ms: int | None = None,
        timeout: float = 3600,
        on_poll: Callable[[], None] | None = None,
        env: dict[str, str] | None = None,
    ) -> bytes:
        """Execute a native tool without a shell; cancellation is independently polled.

        `env`, when given, is merged *on top of* the parent's own environment for this one
        child only (e.g. a hosted-protocol job's credential, ticket 06) — every other caller
        passes nothing and the child inherits the parent's environment unchanged, as before.
        """
        self.cancelled(req)
        child_env = {**os.environ, **env} if env is not None else None
        with tempfile.TemporaryFile() as errors, tempfile.TemporaryFile() as output:
            try:
                proc = subprocess.Popen(
                    args,
                    stdin=subprocess.DEVNULL,
                    stdout=output,
                    stderr=errors,
                    cwd=cwd,
                    env=child_env,
                )
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
                        diagnostics.emit(
                            "worker.tool-timeout",
                            module="runtime/process",
                            level="error",
                            code="TOOL_TIMEOUT",
                            job=req.get("id"),
                            detail={
                                "tool": os.path.basename(args[0]),
                                "timeout_seconds": timeout,
                                "stderr_tail": tool_detail(errors),
                            },
                        )
                        raise WorkerError("TOOL_TIMEOUT")
                    time.sleep(0.025)
                self.cancelled(req)
                if proc.returncode:
                    diagnostics.emit(
                        "worker.tool-failed",
                        module="runtime/process",
                        level="error",
                        code="TOOL_FAILED",
                        job=req.get("id"),
                        detail={
                            "tool": os.path.basename(args[0]),
                            "exit_code": proc.returncode,
                            "stderr_tail": tool_detail(errors),
                        },
                    )
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
