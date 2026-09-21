import hashlib
import json
import os
from pathlib import Path

from assets.registry import sha256
from runtime.errors import WorkerError


class RenderCache:
    def __init__(self, host, recipe, extension):
        self.host = host
        self.recipe = recipe
        self.key = hashlib.sha256(json.dumps(recipe, sort_keys=True).encode()).hexdigest()
        self.folder = host.cache / self.key
        self.output = self.folder / ("output" + extension)
        self.manifest = self.folder / "manifest.json"

    def read(self, req):
        try:
            if self.folder.is_symlink() or self.output.is_symlink() or self.manifest.is_symlink():
                return None
            with self.manifest.open("rb") as stream:
                raw = stream.read(65537)
            if len(raw) > 65536:
                return None
            manifest = json.loads(raw)
            if (
                not isinstance(manifest, dict)
                or manifest.get("recipe") != self.recipe
                or sha256(self.output, lambda: self.host.cancelled(req)) != manifest["sha256"]
                or not isinstance(manifest.get("media"), dict)
            ):
                return None
            media = manifest["media"]
            if (
                type(media.get("duration_ms")) is not int
                or media["duration_ms"] <= 0
                or type(media.get("width")) is not int
                or type(media.get("height")) is not int
            ):
                return None
            self.host.cancelled(req)
            return self.result(manifest, True)
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def publish(self, req, temporary: Path, media: dict, details=None):
        if self.folder.is_symlink():
            raise WorkerError("OUTPUT_UNSAFE")
        self.folder.mkdir(exist_ok=True)
        digest = sha256(temporary, lambda: self.host.cancelled(req))
        manifest = {"recipe": self.recipe, "sha256": digest, "media": media}
        if details:
            manifest["processing"] = details
        staging = temporary.parent / "manifest.json"
        staging.write_text(
            json.dumps(manifest, ensure_ascii=False, allow_nan=False), encoding="utf-8"
        )
        self.host.cancelled(req)
        os.replace(temporary, self.output)
        os.replace(staging, self.manifest)
        return self.result(manifest, False)

    def result(self, manifest, cache_hit):
        result = {
            **manifest["media"],
            "artifact_id": self.key,
            "path": str(self.output),
            "sha256": manifest["sha256"],
            "cache_hit": cache_hit,
            "start_ms": self.recipe["start_ms"],
            "end_ms": self.recipe["end_ms"],
        }
        if "processing" in manifest:
            result["processing"] = manifest["processing"]
        return result
