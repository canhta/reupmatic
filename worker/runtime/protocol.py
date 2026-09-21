from typing import Any

from runtime.errors import WorkerError

PROTOCOL = 1
MAX_LINE = 2 * 1024 * 1024
MAX_JOBS = 32


def bounded_int(value: Any, lo: int, hi: int) -> int:
    if type(value) is not int or not lo <= value <= hi:
        raise WorkerError("INVALID_REQUEST")
    return value


def string(value: Any, limit: int = 4096) -> str:
    if not isinstance(value, str) or not value or len(value) > limit or "\x00" in value:
        raise WorkerError("INVALID_REQUEST")
    return value


def exact(params: Any, required: set[str], optional: set[str] = frozenset()) -> dict:
    if (
        not isinstance(params, dict)
        or not required <= params.keys()
        or params.keys() - (required | optional)
    ):
        raise WorkerError("INVALID_REQUEST")
    return params
