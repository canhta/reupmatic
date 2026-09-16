"""Hash-pinned local VieNeu v3 Turbo ONNX/CPU bundle; no model acquisition."""

from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import json
import math
import os
import re
import uuid
from pathlib import Path

from assets.registry import sha256 as file_hash
from runtime.errors import WorkerError
from runtime.protocol import exact, string
from speech.synthesis.contracts import clean

SDK_VERSION = "3.7.1"
ENGINE = "vieneu-v3-turbo-onnx"
GRAPHS = {
    "vieneu_prefill.onnx",
    "vieneu_decode_step.onnx",
    "vieneu_acoustic_cached.onnx",
    "vieneu_backbone_shared.data",
    "vieneu_v3_heads.npz",
    "config.json",
    "tokenizer.json",
}
CODEC = {"moss_audio_tokenizer_decode_full.onnx", "moss_audio_tokenizer_decode_shared.data"}
FILES = {f"onnx/{name}" for name in GRAPHS} | {f"codec/{name}" for name in CODEC} | {"voices.json"}
FIELDS = {"version", "engine", "directory", "languages", "files"}


def runtime_code() -> str | None:
    try:
        if importlib.metadata.version("vieneu") != SDK_VERSION:
            return "SYNTHESIS_RUNTIME_VERSION"
        if not all(
            importlib.util.find_spec(name)
            for name in ("vieneu", "numpy", "onnxruntime", "tokenizers")
        ):
            return "MODEL_RUNTIME_MISSING"
    except (ImportError, ValueError, importlib.metadata.PackageNotFoundError):
        return "MODEL_RUNTIME_MISSING"
    return None


def read_voices(root: Path) -> list[dict]:
    try:
        with (root / "voices.json").open("rb") as stream:
            raw = stream.read(2 * 1024**2 + 1)
        if len(raw) > 2 * 1024**2:
            raise ValueError
        data = json.loads(raw)
        if (
            not isinstance(data, dict)
            or set(data) != {"version", "voices"}
            or type(data["version"]) is not int
            or data["version"] != 1
        ):
            raise ValueError
        voices = data["voices"]
        if not isinstance(voices, list) or not 1 <= len(voices) <= 100:
            raise ValueError
        seen = set()
        for v in voices:
            if (
                not isinstance(v, dict)
                or set(v) != {"id", "label", "speaker_emb", "ref_codes"}
                or not clean(v["id"], 128)
                or not clean(v["label"], 160)
                or v["id"] in seen
            ):
                raise ValueError
            seen.add(v["id"])
            emb, codes = v["speaker_emb"], v["ref_codes"]
            if (
                not isinstance(emb, list)
                or len(emb) != 192
                or any(
                    type(n) not in (float, int) or not math.isfinite(n) or abs(n) > 1000
                    for n in emb
                )
                or not any(emb)
                or not isinstance(codes, list)
                or not 1 <= len(codes) <= 500
            ):
                raise ValueError
            width = len(codes[0]) if isinstance(codes[0], list) else 0
            if not 1 <= width <= 32 or any(
                not isinstance(row, list)
                or len(row) != width
                or any(type(n) is not int or not 0 <= n < 65536 for n in row)
                for row in codes
            ):
                raise ValueError
        return voices
    except (OSError, ValueError, TypeError, OverflowError):
        raise WorkerError("SYNTHESIS_VOICES_INVALID") from None


def inspect_files(bundle: dict) -> Path:
    try:
        root = Path(bundle["directory"])
        if root.is_symlink() or not root.is_dir() or root.resolve() != root:
            raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
        for folder in ("onnx", "codec"):
            if (root / folder).is_symlink() or not (root / folder).is_dir():
                raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
        actual = set()
        for path in root.rglob("*"):
            name = path.relative_to(root).as_posix()
            if path.is_symlink() or (name not in ("onnx", "codec") and name not in FILES):
                raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
            if path.is_file():
                actual.add(name)
                limit = 4 * 1024**3 if path.suffix in (".onnx", ".data", ".npz") else 16 * 1024**2
                if not 0 < path.stat().st_size <= limit:
                    raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
        if actual != FILES:
            raise WorkerError("MODEL_MISSING")
        return root
    except OSError:
        raise WorkerError("MODEL_MISSING") from None


def verify_bundle(bundle: dict, check=lambda: None) -> None:
    root = inspect_files(bundle)
    for name, digest in bundle["files"].items():
        check()
        if file_hash(root / name, check) != digest:
            raise WorkerError("MODEL_HASH_MISMATCH")


class SynthesisRegistry:
    def __init__(self, manifest: Path):
        self.manifest = manifest

    def read(self) -> dict:
        try:
            with self.manifest.open("rb") as stream:
                raw = stream.read(65537)
            value = json.loads(raw) if len(raw) <= 65536 else None
            if (
                not isinstance(value, dict)
                or set(value) != FIELDS
                or type(value["version"]) is not int
                or value["version"] != 1
                or value["engine"] != ENGINE
            ):
                raise ValueError
            langs, files, directory = value["languages"], value["files"], value["directory"]
            if (
                not isinstance(langs, list)
                or not 1 <= len(langs) <= 2
                or any(lang not in ("en", "vi") for lang in langs)
                or len(set(langs)) != len(langs)
                or not isinstance(files, dict)
                or set(files) != FILES
                or any(
                    not isinstance(v, str) or not re.fullmatch("[a-f0-9]{64}", v)
                    for v in files.values()
                )
                or not isinstance(directory, str)
                or not directory
                or len(directory) > 4096
                or "\x00" in directory
                or "://" in directory
                or directory.startswith(("\\\\", "//"))
            ):
                raise ValueError
            root = Path(directory)
            if not root.is_absolute():
                root = self.manifest.parent / root
            if root.is_symlink():
                raise ValueError
            bundle = {**value, "directory": str(root.resolve(strict=True))}
            inspect_files(bundle)
            read_voices(Path(bundle["directory"]))
            identity = {key: bundle[key] for key in ("engine", "languages", "files")}
            identity.update(adapter=1, sdk=SDK_VERSION, device="cpu", precision="fp32")
            bundle["model_id"] = hashlib.sha256(
                json.dumps(identity, sort_keys=True).encode()
            ).hexdigest()
            return bundle
        except FileNotFoundError:
            raise WorkerError("MODEL_MISSING") from None
        except (OSError, ValueError, TypeError):
            raise WorkerError("SYNTHESIS_MANIFEST_INVALID") from None

    def require(self, language: str, voice: str, expected_id: str, check=lambda: None) -> dict:
        check()
        bundle = self.read()
        if bundle["model_id"] != expected_id:
            raise WorkerError("SYNTHESIS_MODEL_CHANGED")
        if language not in bundle["languages"]:
            raise WorkerError("MODEL_LANGUAGE_UNAVAILABLE")
        verify_bundle(bundle, check)
        if voice not in {v["id"] for v in read_voices(Path(bundle["directory"]))}:
            raise WorkerError("SYNTHESIS_VOICE_UNAVAILABLE")
        code = runtime_code()
        if code:
            raise WorkerError(code)
        return bundle

    def status(self) -> dict:
        value = {
            "available": False,
            "code": None,
            "model_id": None,
            "languages": [],
            "voices": [],
            "verified": False,
        }
        try:
            bundle = self.read()
            value.update(
                model_id=bundle["model_id"],
                languages=bundle["languages"],
                voices=[
                    {k: v[k] for k in ("id", "label")}
                    for v in read_voices(Path(bundle["directory"]))
                ],
            )
            code = runtime_code()
            if code:
                raise WorkerError(code)
            value["available"] = True
        except WorkerError as error:
            value["code"] = error.code
        return value


def configure_synthesis(host, req: dict) -> dict:
    p = exact(req["params"], {"path"})
    bundle = SynthesisRegistry(Path(string(p["path"]))).read()

    def check():
        return host.cancelled(req)

    verify_bundle(bundle, check)
    target = host.workspace / "local-synthesis.json"
    temporary = target.with_name(f".local-synthesis-{uuid.uuid4()}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump({key: bundle[key] for key in FIELDS}, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        check()
        temporary.replace(target)
        host.synthesis_models = SynthesisRegistry(target)
    finally:
        temporary.unlink(missing_ok=True)
    return host.synthesis_models.status()
