"""Stream a remote media URL to a caller-chosen path, then prove the bytes are playable."""

import hashlib
import http.client
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from runtime import diagnostics
from runtime.context import WorkerContext
from runtime.errors import WorkerError
from runtime.protocol import bounded_int, exact, string
from runtime.tls import https_context

from media.probe import probe_file

_CHUNK = 256 * 1024
# Socket timeout is per blocking call, so only a read making no progress trips it.
_TIMEOUT = int(os.environ.get("REUPMATIC_DOWNLOAD_TIMEOUT", "60"))
_MAX_COOKIES = 64
_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Reupmatic/1.0"


def _has_control(value: str) -> bool:
    return any(char in value for char in "\r\n\x00")


def _cookie_header(entries: object) -> str | None:
    if entries is None:
        return None
    if not isinstance(entries, list) or len(entries) > _MAX_COOKIES:
        raise WorkerError("INVALID_REQUEST")
    parts = []
    for entry in entries:
        exact(entry, {"name", "value"})
        name, value = entry["name"], entry["value"]
        if not isinstance(name, str) or not 0 < len(name) <= 256:
            raise WorkerError("INVALID_REQUEST")
        if not isinstance(value, str) or len(value) > 4096:
            raise WorkerError("INVALID_REQUEST")
        if _has_control(name) or any(char in name for char in "=;") or _has_control(value):
            raise WorkerError("INVALID_REQUEST")
        parts.append(f"{name}={value}")
    return "; ".join(parts)


def _host_of(url: str) -> str:
    """The URL's hostname only: a CDN query string carries signed, expiring tokens."""
    try:
        return urllib.parse.urlsplit(url).hostname or "-"
    except ValueError:
        return "-"


def _refused(req: dict, code: str, phase: str, host: str, exc: BaseException | None, **detail):
    """Emit the status, phase and CDN host that explain a refused transfer."""
    diagnostics.emit(
        "media.download-failed",
        module="media",
        level="warn",
        code=code,
        job=req.get("id"),
        detail={
            "phase": phase,
            "host": host,
            "exception": type(exc).__name__ if exc is not None else None,
            **detail,
        },
    )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def _result(
    destination: Path, size: int, digest: str, info: dict, reused: bool, resumed: bool
) -> dict:
    return {
        "path": str(destination),
        "bytes": size,
        "sha256": digest,
        **info,
        "reused": reused,
        "resumed": resumed,
    }


def _existing(host: WorkerContext, req: dict, destination: Path) -> dict:
    if not destination.is_file():
        raise WorkerError("OUTPUT_UNSAFE")
    info = probe_file(host, req, destination)
    return _result(
        destination,
        destination.stat().st_size,
        _sha256(destination),
        info,
        reused=True,
        resumed=False,
    )


def download(host: WorkerContext, req: dict) -> dict:
    p = exact(
        req["params"],
        {"url", "destination"},
        {"cookies", "referer", "expected_size", "resume"},
    )
    url = string(p["url"], 8192)
    if _has_control(url):
        raise WorkerError("INVALID_REQUEST")
    destination = Path(p["destination"])
    if not destination.is_absolute():
        raise WorkerError("PATH_NOT_ABSOLUTE")
    if destination.exists():
        return _existing(host, req, destination)

    expected = p.get("expected_size")
    if expected is not None:
        expected = bounded_int(expected, 0, 2**53 - 1)
    resume = p.get("resume", False)
    if type(resume) is not bool:
        raise WorkerError("INVALID_REQUEST")
    referer = p.get("referer")
    if referer is not None:
        referer = string(referer, 8192)
        if _has_control(referer):
            raise WorkerError("INVALID_REQUEST")
    cookies = _cookie_header(p.get("cookies"))

    destination.parent.mkdir(parents=True, exist_ok=True)
    part = destination.with_name(destination.name + ".part")
    if part.exists() and not part.is_file():
        raise WorkerError("OUTPUT_UNSAFE")

    offset = part.stat().st_size if (resume and part.exists()) else 0
    host_name = _host_of(url)
    started = time.monotonic()
    status = None
    resumed = False
    installed = False
    try:
        if expected is not None and offset == expected:
            total = offset
            resumed = offset > 0
        else:
            headers = {"User-Agent": _USER_AGENT}
            if cookies:
                headers["Cookie"] = cookies
            if referer:
                headers["Referer"] = referer
            if offset > 0:
                headers["Range"] = f"bytes={offset}-"
            request = urllib.request.Request(url, headers=headers, method="GET")
            try:
                response = urllib.request.urlopen(
                    request, timeout=_TIMEOUT, context=https_context()
                )
            except urllib.error.HTTPError as exc:
                _refused(
                    req,
                    "DOWNLOAD_FAILED",
                    "connect",
                    host_name,
                    exc,
                    http_status=exc.code,
                    offset=offset,
                )
                raise WorkerError("DOWNLOAD_FAILED") from exc
            except (urllib.error.URLError, http.client.HTTPException, OSError, ValueError) as exc:
                _refused(req, "DOWNLOAD_FAILED", "connect", host_name, exc, offset=offset)
                raise WorkerError("DOWNLOAD_FAILED") from exc
            with response:
                status = response.status
                if offset > 0 and response.status == 206:
                    mode = "ab"
                    resumed = True
                else:
                    offset = 0
                    mode = "wb"
                declared = response.headers.get("Content-Length")
                if declared is not None:
                    try:
                        declared = bounded_int(int(declared), 0, 2**53 - 1)
                    except (TypeError, ValueError) as exc:
                        _refused(
                            req, "DOWNLOAD_FAILED", "headers", host_name, exc, http_status=status
                        )
                        raise WorkerError("DOWNLOAD_FAILED") from exc
                total = offset
                with part.open(mode) as handle:
                    while True:
                        host.cancelled(req)
                        try:
                            chunk = response.read(_CHUNK)
                        except TimeoutError as exc:
                            _refused(
                                req,
                                "DOWNLOAD_STALLED",
                                "read",
                                host_name,
                                exc,
                                http_status=status,
                                bytes=total,
                                offset=offset,
                            )
                            raise WorkerError("DOWNLOAD_STALLED") from exc
                        except (http.client.HTTPException, OSError) as exc:
                            _refused(
                                req,
                                "DOWNLOAD_FAILED",
                                "read",
                                host_name,
                                exc,
                                http_status=status,
                                bytes=total,
                                offset=offset,
                            )
                            raise WorkerError("DOWNLOAD_FAILED") from exc
                        if not chunk:
                            break
                        handle.write(chunk)
                        total += len(chunk)
                if declared is not None and total != offset + declared:
                    _refused(
                        req,
                        "DOWNLOAD_SIZE_MISMATCH",
                        "read",
                        host_name,
                        None,
                        http_status=status,
                        bytes=total,
                        offset=offset,
                        declared=declared,
                    )
                    raise WorkerError("DOWNLOAD_SIZE_MISMATCH")
        if expected is not None and total != expected:
            _refused(
                req,
                "DOWNLOAD_SIZE_MISMATCH",
                "verify",
                host_name,
                None,
                http_status=status,
                bytes=total,
                expected=expected,
            )
            raise WorkerError("DOWNLOAD_SIZE_MISMATCH")
        info = probe_file(host, req, part)
        size = part.stat().st_size
        digest = _sha256(part)
        os.replace(part, destination)
        installed = True
        diagnostics.emit(
            "media.download-done",
            module="media",
            job=req.get("id"),
            detail={
                "host": host_name,
                "http_status": status,
                "bytes": size,
                "resumed": resumed,
                "elapsed_ms": int((time.monotonic() - started) * 1000),
            },
        )
        return _result(destination, size, digest, info, reused=False, resumed=resumed)
    finally:
        if not installed:
            try:
                part.unlink()
            except FileNotFoundError:
                pass
