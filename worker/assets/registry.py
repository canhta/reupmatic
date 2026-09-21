import hashlib
import uuid
from pathlib import Path

from runtime.errors import WorkerError
from runtime.protocol import exact, string


def sha256(path: Path, check=lambda: None) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b""):
            check()
            digest.update(chunk)
    return digest.hexdigest()


def signature(path: Path) -> tuple[int, int]:
    stat = path.stat()
    return stat.st_size, stat.st_mtime_ns


class AssetRegistry:
    def __init__(self):
        self._assets: dict[str, dict] = {}

    def register(self, req: dict) -> dict:
        p = exact(req["params"], {"path", "kind"})
        if p["kind"] not in {"video", "subtitle", "audio", "image"}:
            raise WorkerError("INVALID_REQUEST")
        path = Path(string(p["path"]))
        if not path.is_absolute():
            raise WorkerError("PATH_NOT_ABSOLUTE")
        try:
            path = path.resolve(strict=True)
        except OSError:
            raise WorkerError("SOURCE_MISSING")
        if not path.is_file():
            raise WorkerError("SOURCE_MISSING")
        if p["kind"] == "subtitle" and path.suffix.lower() not in {".srt", ".ass"}:
            raise WorkerError("FORMAT_UNAVAILABLE")
        if p["kind"] == "image" and path.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
            raise WorkerError("FORMAT_UNAVAILABLE")
        before = signature(path)
        digest = sha256(path)
        if before != signature(path):
            raise WorkerError("SOURCE_CHANGED")
        aid = str(uuid.uuid4())
        self._assets[aid] = {"path": path, "signature": before, "sha256": digest, "kind": p["kind"]}
        return {"asset_id": aid, "name": path.name, "sha256": digest, "kind": p["kind"]}

    def get(self, aid: str, kind: str | None = None) -> dict:
        item = self._assets.get(string(aid, 128))
        if not item:
            raise WorkerError("UNKNOWN_ASSET")
        try:
            if item["signature"] != signature(item["path"]):
                raise WorkerError("SOURCE_CHANGED")
        except OSError:
            raise WorkerError("SOURCE_MISSING")
        if kind and item["kind"] != kind:
            raise WorkerError("ASSET_KIND")
        return item

    def verify(self, aid: str, kind: str | None = None, check=lambda: None) -> dict:
        item = self.get(aid, kind)
        try:
            if sha256(item["path"], check) != item["sha256"]:
                raise WorkerError("SOURCE_CHANGED")
        except OSError:
            raise WorkerError("SOURCE_MISSING") from None
        self.get(aid, kind)
        return item
