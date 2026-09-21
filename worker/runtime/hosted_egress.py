"""Defense in depth for the hosted-protocol child, not an operating-system sandbox — the same
caveat `runtime.offline` states for the local inference child. This file is new and
`runtime.offline` is untouched: the local child keeps its own unconditional denial, and this
one narrows egress instead of relaxing that one, per D-55/ticket 06 ("two children, two
explicit policies").

Outbound sockets are permitted only to the one host configured for the job at hand
(`SpeechProvider.endpoint_host`); subprocess and exec stay denied exactly as they are for the
local child. The allowed host's addresses are resolved once, before the hook is installed, so
the hook itself never has to trust an attacker-controlled hostname string at connect time —
only IPs already known to belong to the configured host.
"""

from __future__ import annotations

import socket
from typing import Callable

from runtime.errors import WorkerError

_DENIED_PROCESS_EVENTS = {
    "subprocess.Popen",
    "os.system",
    "os.posix_spawn",
    "os.exec",
    "os.spawn",
}
_CONNECT_EVENTS = {"socket.connect", "socket.connect_ex", "socket.sendto", "socket.sendmsg"}


def _hostname(endpoint_host: str) -> str:
    # `endpoint_host` (app/core/speech/providers.ts's parseProviderDraft) may carry an explicit
    # port ("host:port"); the resolution and the comparison below both want the bare host.
    return endpoint_host.rsplit(":", 1)[0]


def _resolved_ips(hostname: str) -> frozenset[str]:
    try:
        return frozenset(info[4][0] for info in socket.getaddrinfo(hostname, None))
    except OSError:
        return frozenset()


def deny_network_except_host(endpoint_host: str) -> Callable[[str, tuple], None]:
    """Builds one job's audit hook, closed over its own configured host so a hosted child
    started for a different provider can never inherit another job's allowance."""
    allowed_host = _hostname(endpoint_host)
    allowed_ips = _resolved_ips(allowed_host)

    def hook(event: str, args: tuple) -> None:
        if event in _DENIED_PROCESS_EVENTS:
            raise WorkerError("MODEL_NETWORK_DISABLED")
        if event == "socket.getaddrinfo":
            host = args[0] if args else None
            if isinstance(host, bytes):
                host = host.decode("utf-8", "replace")
            if host is not None and host != allowed_host and host not in allowed_ips:
                raise WorkerError("MODEL_NETWORK_DISABLED")
            return
        if event in _CONNECT_EVENTS:
            address = args[1] if len(args) > 1 else None
            ip = address[0] if isinstance(address, tuple) and address else None
            if ip is None or ip not in allowed_ips:
                raise WorkerError("MODEL_NETWORK_DISABLED")

    return hook
