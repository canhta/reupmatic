"""Egress policy for the hosted-protocol child: allow only the job's configured host."""

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
    # `endpoint_host` may carry an explicit "host:port"; the bare host is wanted here.
    return endpoint_host.rsplit(":", 1)[0]


def _resolved_ips(hostname: str) -> frozenset[str]:
    try:
        return frozenset(info[4][0] for info in socket.getaddrinfo(hostname, None))
    except OSError:
        return frozenset()


def deny_network_except_host(endpoint_host: str) -> Callable[[str, tuple], None]:
    """Build one job's audit hook, closed over its own configured host."""
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
