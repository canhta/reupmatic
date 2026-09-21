"""HTTPS trust context; falls back to the OS CA bundle when Python ships none."""

from __future__ import annotations

import functools
import ssl
from collections.abc import Callable, Iterable
from pathlib import Path

SYSTEM_BUNDLES = (
    Path("/etc/ssl/cert.pem"),
    Path("/etc/ssl/certs/ca-certificates.crt"),
    Path("/etc/pki/tls/certs/ca-bundle.crt"),
)


def build_context(
    default: Callable[[], ssl.SSLContext] = ssl.create_default_context,
    candidates: Iterable[Path] = SYSTEM_BUNDLES,
) -> ssl.SSLContext:
    context = default()
    if context.cert_store_stats()["x509_ca"] > 0:
        return context
    for bundle in candidates:
        if bundle.is_file():
            try:
                context.load_verify_locations(cafile=str(bundle))
            except (OSError, ssl.SSLError):
                continue
            if context.cert_store_stats()["x509_ca"] > 0:
                break
    context.verify_mode = ssl.CERT_REQUIRED
    context.check_hostname = True
    return context


@functools.cache
def https_context() -> ssl.SSLContext:
    return build_context()
