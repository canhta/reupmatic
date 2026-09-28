"""The worker's half of the Diagnostic record contract: one JSON object per stderr line."""

from __future__ import annotations

import json
import sys
import threading
from datetime import datetime, timezone
from typing import Any

LEVELS = ("error", "warn", "info", "debug")
PROCESS = "worker"
CORRELATION_KEYS = ("job", "workflow_run", "batch", "content", "project")
FIELDS = ("at", "level", "source", "event", "message", "code", "correlation", "detail")

MAX_TEXT = 2000
_lock = threading.Lock()


def _value(value: Any) -> str | int | float | bool | None:
    """Flatten one detail field onto the value-only shape the record contract allows."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int) or (isinstance(value, float) and value == value):
        return value
    return str(value)[:MAX_TEXT]


def emit(
    event: str,
    *,
    module: str,
    level: str = "info",
    message: str | None = None,
    code: str | None = None,
    job: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    """Write one Diagnostic record to stderr. Never raises: diagnostics must not fail a job."""
    record: dict[str, Any] = {
        "at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "level": level if level in LEVELS else "info",
        "source": {"process": PROCESS, "module": module},
        "event": event,
    }
    if message:
        record["message"] = str(message)[:MAX_TEXT]
    if code:
        record["code"] = code
    if job:
        record["correlation"] = {"job": str(job)[:128]}
    if detail:
        record["detail"] = {str(key): _value(value) for key, value in detail.items()}
    try:
        line = json.dumps(record, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError):
        return
    with _lock:
        try:
            sys.stderr.write(f"{line}\n")
            sys.stderr.flush()
        except (BrokenPipeError, OSError, ValueError):
            # A closed or broken stderr must never take the worker down with it.
            pass
