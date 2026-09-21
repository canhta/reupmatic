"""Validate a native-selected manifest and atomically persist local configuration."""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from runtime.errors import WorkerError
from runtime.protocol import exact, string

from vision.models import ModelRegistry

_KEYS = {"ocr", "inpainting"}


def _candidate(req: dict) -> Path:
    exact(req["params"], {"path"})
    filename = string(req["params"]["path"], 4096)
    candidate = Path(filename)
    if (
        not candidate.is_absolute()
        or "://" in filename
        or filename.startswith(("\\\\", "//"))
        or "\x00" in filename
    ):
        raise WorkerError("INVALID_REQUEST")
    if os.environ.get("REUPMATIC_MODEL_MANIFEST"):
        raise WorkerError("MODEL_CONFIG_OVERRIDE")
    return candidate


def _write_manifest(destination: Path, value: dict) -> None:
    temporary = destination.parent / f".local-models.{uuid.uuid4()}.tmp"
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            os.chmod(temporary, 0o600)
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _read_store(destination: Path) -> dict | None:
    """Read the raw store without resolving its files; `None` means there is no store."""
    try:
        with destination.open("rb") as stream:
            raw = stream.read(65537)
        value = json.loads(raw) if len(raw) <= 65536 else None
    except FileNotFoundError:
        return None
    if not isinstance(value, dict) or value.keys() - _KEYS:
        raise WorkerError("MODEL_MANIFEST_INVALID")
    return value


def _under(destination: Path, directory: Path, stored: object) -> bool:
    if not isinstance(stored, str):
        return False
    path = Path(stored)
    resolved = (path if path.is_absolute() else destination.parent / path).resolve()
    return directory in resolved.parents


def _pack_under(destination: Path, directory: Path, pack: object) -> bool:
    if not isinstance(pack, dict):
        return False
    return all(
        isinstance(pack.get(role), dict) and _under(destination, directory, pack[role].get("path"))
        for role in ("det", "rec", "keys")
    )


def configure_models(host, req: dict) -> dict:
    candidate = _candidate(req)

    def check():
        return host.cancelled(req)

    check()
    normalized = ModelRegistry(candidate).validated_manifest(check)
    destination = host.workspace / "local-models.json"
    check()
    _write_manifest(destination, normalized)
    host.models = ModelRegistry(destination)
    return {"configured": True, "models": host.models.status()}


def merge_models(host, req: dict) -> dict:
    """Add one manifest's capabilities to the store instead of replacing it."""
    candidate = _candidate(req)

    def check():
        return host.cancelled(req)

    check()
    incoming = ModelRegistry(candidate).validated_manifest(check)
    destination = host.workspace / "local-models.json"
    existing = _read_store(destination) or {}
    merged: dict = {}
    ocr = {**existing.get("ocr", {}), **incoming.get("ocr", {})}
    if ocr:
        merged["ocr"] = ocr
    inpainting = incoming.get("inpainting", existing.get("inpainting"))
    if inpainting is not None:
        merged["inpainting"] = inpainting
    check()
    _write_manifest(destination, merged)
    host.models = ModelRegistry(destination)
    return {"configured": True, "models": host.models.status()}


def unconfigure_models(host, req: dict) -> dict:
    """Forget only the sections whose artifacts live under `directory`."""
    params = exact(req["params"], {"directory"})
    directory = Path(string(params["directory"])).resolve()
    destination = host.workspace / "local-models.json"
    value = _read_store(destination)
    if value is not None:
        remaining: dict = {}
        ocr = value.get("ocr", {})
        if isinstance(ocr, dict):
            keep = {
                language: pack
                for language, pack in ocr.items()
                if not _pack_under(destination, directory, pack)
            }
            if keep:
                remaining["ocr"] = keep
        inpainting = value.get("inpainting")
        if isinstance(inpainting, dict) and not _under(
            destination, directory, (inpainting.get("model") or {}).get("path")
        ):
            remaining["inpainting"] = inpainting
        if remaining:
            _write_manifest(destination, remaining)
        else:
            destination.unlink(missing_ok=True)
        host.models = ModelRegistry(destination)
    return {"configured": False, "models": host.models.status()}
