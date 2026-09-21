"""One HTTPS trust context for every outbound worker request.

`ssl.create_default_context()` trusts whatever CA store the interpreter was built against. A
python.org macOS framework ships that store empty until its "Install Certificates" script runs,
so every HTTPS request fails with "self-signed certificate in certificate chain" (a Douyin CDN
download, live). The OS bundle is the fallback, so trust never depends on how Python
was installed. Verification is never relaxed: with no bundle anywhere, requests still verify and
fail loudly rather than trusting everything.
"""

from __future__ import annotations

import functools
import ssl
from collections.abc import Callable, Iterable
from pathlib import Path

# The OS-maintained bundles: macOS, Debian/Ubuntu/Alpine, Fedora/RHEL. Windows needs none — the
# default context already loads the system store there.
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
