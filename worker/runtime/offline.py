"""Defense in depth for local inference children, not an operating-system sandbox."""

from runtime.errors import WorkerError


def deny_network_and_children(event: str, args: tuple) -> None:
    if event in {
        "socket.connect",
        "socket.getaddrinfo",
        "socket.sendto",
        "socket.sendmsg",
        "subprocess.Popen",
        "os.system",
        "os.posix_spawn",
        "os.exec",
        "os.spawn",
    }:
        raise WorkerError("MODEL_NETWORK_DISABLED")
