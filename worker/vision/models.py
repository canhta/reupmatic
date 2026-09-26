"""Read-only local model registry. No discovery download, package install or inference."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from pathlib import Path
from typing import Callable

from assets.registry import sha256 as file_hash
from runtime.errors import WorkerError

LANGUAGES = {"en", "vi", "zh"}
VERSIONS = {"PP-OCRv3", "PP-OCRv4", "PP-OCRv5"}


class ModelRegistry:
    def __init__(self, manifest: Path):
        self.manifest = manifest

    def _read(self) -> dict:
        try:
            with self.manifest.open("rb") as stream:
                raw = stream.read(65537)
            if len(raw) > 65536:
                raise ValueError
            value = json.loads(raw)
            if not isinstance(value, dict) or value.keys() - {"ocr", "inpainting"}:
                raise ValueError
            return value
        except FileNotFoundError:
            raise WorkerError("MODEL_MISSING") from None
        except (OSError, ValueError, TypeError):
            raise WorkerError("MODEL_MANIFEST_INVALID") from None

    def _artifact(self, value: object, verify: bool, check: Callable[[], None]) -> dict:
        if (
            not isinstance(value, dict)
            or set(value) != {"path", "sha256"}
            or not isinstance(value["path"], str)
            or not value["path"]
            or len(value["path"]) > 4096
            or "\x00" in value["path"]
            or "://" in value["path"]
            or value["path"].startswith(("\\\\", "//"))
            or not isinstance(value["sha256"], str)
            or not re.fullmatch(r"[0-9a-f]{64}", value["sha256"])
        ):
            raise WorkerError("MODEL_MANIFEST_INVALID")
        path = Path(value["path"])
        if not path.is_absolute():
            path = self.manifest.parent / path
        try:
            path = path.resolve(strict=True)
            if not path.is_file() or not 0 < path.stat().st_size <= 2 * 1024**3:
                raise WorkerError("MODEL_MISSING")
            if verify and file_hash(path, check) != value["sha256"]:
                raise WorkerError("MODEL_HASH_MISMATCH")
        except OSError:
            raise WorkerError("MODEL_MISSING") from None
        return {"path": str(path), "sha256": value["sha256"]}

    def require(
        self,
        kind: str,
        language: str | None = None,
        *,
        verify: bool = True,
        check: Callable[[], None] = lambda: None,
        runtime: bool = True,
    ) -> dict:
        manifest = self._read()
        if kind == "ocr":
            entries = manifest.get("ocr", {})
            if not isinstance(entries, dict) or entries.keys() - LANGUAGES:
                raise WorkerError("MODEL_MANIFEST_INVALID")
            if language not in entries:
                raise WorkerError("MODEL_LANGUAGE_UNAVAILABLE" if entries else "MODEL_MISSING")
            item = entries[language]
            if (
                not isinstance(item, dict)
                or set(item) != {"det", "rec", "keys", "det_version", "rec_version", "rec_height"}
                or item["det_version"] not in VERSIONS
                or item["rec_version"] not in VERSIONS
                or type(item["rec_height"]) is not int
                or item["rec_height"] not in {32, 48}
            ):
                raise WorkerError("MODEL_MANIFEST_INVALID")
            bundle = {
                key: self._artifact(item[key], verify, check) for key in ("det", "rec", "keys")
            }
            bundle.update({key: item[key] for key in ("det_version", "rec_version", "rec_height")})
            bundle["language"] = language
            packages = ("numpy", "cv2", "onnxruntime", "rapidocr")
        elif kind == "inpainting":
            item = manifest.get("inpainting")
            if item is None:
                raise WorkerError("MODEL_MISSING")
            if not isinstance(item, dict) or set(item) != {"model"}:
                raise WorkerError("MODEL_MANIFEST_INVALID")
            bundle = {"model": self._artifact(item["model"], verify, check)}
            packages = ("numpy", "cv2", "onnxruntime")
        else:
            raise WorkerError("INVALID_REQUEST")
        if runtime and any(importlib.util.find_spec(name) is None for name in packages):
            raise WorkerError("RUNTIME_PACK_MISSING")
        # Paths are NOT included in identity or public status.
        identity = {
            key: value["sha256"] if isinstance(value, dict) else value
            for key, value in bundle.items()
        }
        bundle["fingerprint"] = hashlib.sha256(
            json.dumps(identity, sort_keys=True).encode()
        ).hexdigest()
        return bundle

    def validated_manifest(self, check: Callable[[], None]) -> dict:
        raw = self._read()
        entries = raw.get("ocr", {})
        if not isinstance(entries, dict) or entries.keys() - LANGUAGES:
            raise WorkerError("MODEL_MANIFEST_INVALID")
        if not entries and "inpainting" not in raw:
            raise WorkerError("MODEL_MANIFEST_INVALID")
        result: dict = {}
        if entries:
            result["ocr"] = {}
            for language in sorted(entries):
                bundle = self.require("ocr", language, check=check, runtime=False)
                result["ocr"][language] = {
                    key: bundle[key]
                    for key in ("det", "rec", "keys", "det_version", "rec_version", "rec_height")
                }
        if "inpainting" in raw:
            bundle = self.require("inpainting", check=check, runtime=False)
            result["inpainting"] = {"model": bundle["model"]}
        return result

    def status(self) -> dict:
        result = {}
        for kind in ("ocr", "inpainting"):
            languages: list[str] = []
            code: str | None = None
            try:
                if kind == "ocr":
                    entries = self._read().get("ocr", {})
                    if not isinstance(entries, dict) or entries.keys() - LANGUAGES:
                        raise WorkerError("MODEL_MANIFEST_INVALID")
                    if not entries:
                        raise WorkerError("MODEL_MISSING")
                    failures: list[str] = []
                    for language in sorted(entries):
                        try:
                            self.require(kind, language, verify=False)
                            languages.append(language)
                        except WorkerError as error:
                            failures.append(error.code)
                    if not languages:
                        raise WorkerError(failures[0])
                else:
                    self.require(kind, verify=False)
            except WorkerError as error:
                code = error.code
            result[kind] = {
                "available": code is None,
                "code": code,
                "languages": languages,
                "verified": False,
            }
        return result
