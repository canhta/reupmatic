"""Hash-pinned local synthesis bundles; engines are code, bundles are configuration."""

from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import json
import math
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping

from assets.registry import sha256 as file_hash
from runtime.errors import WorkerError
from runtime.protocol import exact, string
from speech.synthesis.adapters import vieneu_v3_nano, vieneu_v3_turbo
from speech.synthesis.contracts import clean

SDK_VERSION = "3.7.1"
FIELDS = {"engine", "directory", "languages", "files"}
VOICE_FILE_LIMIT = 8 * 1024**2

TURBO_ENGINE = "vieneu-v3-turbo-onnx"
_TURBO_GRAPHS = {
    "vieneu_prefill.onnx",
    "vieneu_decode_step.onnx",
    "vieneu_acoustic_cached.onnx",
    "vieneu_backbone_shared.data",
    "vieneu_v3_heads.npz",
    "config.json",
    "tokenizer.json",
}
_TURBO_CODEC = {"moss_audio_tokenizer_decode_full.onnx", "moss_audio_tokenizer_decode_shared.data"}
_TURBO_FILES = (
    {f"onnx/{name}" for name in _TURBO_GRAPHS}
    | {f"codec/{name}" for name in _TURBO_CODEC}
    | {"voices.json"}
)
_TURBO_DIRECTORIES = ("onnx", "codec")

# The optional clone add-on for Turbo: kept out of the base bundle so preset users stay small.
CLONE_ENGINE = "vieneu-v3-turbo-clone-onnx"
_CLONE_FILES = {
    "speaker_encoder.onnx",
    "denoiser.onnx",
    "codec/moss_audio_tokenizer_encode.onnx",
    "codec/moss_audio_tokenizer_encode.data",
}
_CLONE_DIRECTORIES = ("codec",)
CLONE_MANIFEST_NAME = "local-synthesis-clone.json"

NANO_ENGINE = "vieneu-v3-nano-onnx"
_NANO_GRAPHS = {
    "text_encoder.onnx",
    "duration_predictor.onnx",
    "vector_estimator.onnx",
    "codec_decoder.onnx",
    "config.json",
    "constants.npz",
}
_NANO_FILES = _NANO_GRAPHS | {"voices.json"}
_NANO_DIRECTORIES: tuple[str, ...] = ()


def turbo_runtime_code() -> str | None:
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


def clone_runtime_code() -> str | None:
    try:
        if importlib.metadata.version("vieneu") != SDK_VERSION:
            return "SYNTHESIS_RUNTIME_VERSION"
        if not all(
            importlib.util.find_spec(name)
            for name in (
                "vieneu",
                "numpy",
                "onnxruntime",
                "soxr",
                "kaldi_native_fbank",
                "soundfile",
            )
        ):
            return "MODEL_RUNTIME_MISSING"
    except (ImportError, ValueError, importlib.metadata.PackageNotFoundError):
        return "MODEL_RUNTIME_MISSING"
    return None


def nano_runtime_code() -> str | None:
    try:
        if importlib.metadata.version("vieneu") != SDK_VERSION:
            return "SYNTHESIS_RUNTIME_VERSION"
        if not all(importlib.util.find_spec(name) for name in ("vieneu", "numpy", "onnxruntime")):
            return "MODEL_RUNTIME_MISSING"
    except (ImportError, ValueError, importlib.metadata.PackageNotFoundError):
        return "MODEL_RUNTIME_MISSING"
    return None


def read_voices(root: Path) -> list[dict]:
    """v3 Turbo presets: `speaker_emb` plus integer `ref_codes` matching the codec's n_vq."""
    try:
        with (root / "voices.json").open("rb") as stream:
            raw = stream.read(VOICE_FILE_LIMIT + 1)
        if len(raw) > VOICE_FILE_LIMIT:
            raise ValueError
        data = json.loads(raw)
        if not isinstance(data, dict) or set(data) != {"voices"}:
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


def read_nano_voices(root: Path) -> list[dict]:
    """v3 Nano presets: `speaker_emb` plus a float `style` token array (width 256)."""
    try:
        with (root / "voices.json").open("rb") as stream:
            raw = stream.read(VOICE_FILE_LIMIT + 1)
        if len(raw) > VOICE_FILE_LIMIT:
            raise ValueError
        data = json.loads(raw)
        if not isinstance(data, dict) or set(data) != {"voices"}:
            raise ValueError
        voices = data["voices"]
        if not isinstance(voices, list) or not 1 <= len(voices) <= 100:
            raise ValueError
        seen = set()
        for v in voices:
            if (
                not isinstance(v, dict)
                or set(v) != {"id", "label", "speaker_emb", "style"}
                or not clean(v["id"], 128)
                or not clean(v["label"], 160)
                or v["id"] in seen
            ):
                raise ValueError
            seen.add(v["id"])
            emb, style = v["speaker_emb"], v["style"]
            if (
                not isinstance(emb, list)
                or len(emb) != 192
                or any(
                    type(n) not in (float, int) or not math.isfinite(n) or abs(n) > 1000
                    for n in emb
                )
                or not any(emb)
                or not isinstance(style, list)
                or not 1 <= len(style) <= 500
            ):
                raise ValueError
            width = len(style[0]) if isinstance(style[0], list) else 0
            if width != 256 or any(
                not isinstance(row, list)
                or len(row) != width
                or any(
                    type(n) not in (float, int) or not math.isfinite(n) or abs(n) > 1000
                    for n in row
                )
                for row in style
            ):
                raise ValueError
        return voices
    except (OSError, ValueError, TypeError, OverflowError):
        raise WorkerError("SYNTHESIS_VOICES_INVALID") from None


_TURBO_PRESETS = "voices_v3_turbo.json"
_NANO_PRESETS = "voices_v3_nano.json"


def _sdk_packages_root() -> Path:
    try:
        spec = importlib.util.find_spec("vieneu")
    except (ImportError, ValueError):
        spec = None
    origin = getattr(spec, "origin", None)
    if not isinstance(origin, str) or not origin:
        raise WorkerError("SYNTHESIS_VOICES_UNAVAILABLE")
    return Path(origin).resolve().parent


def _sdk_presets(filename: str) -> dict:
    try:
        with (_sdk_packages_root() / "assets" / filename).open("rb") as stream:
            raw = stream.read(VOICE_FILE_LIMIT + 1)
        if len(raw) > VOICE_FILE_LIMIT:
            raise ValueError
        presets = json.loads(raw)["presets"]
        if not isinstance(presets, dict) or not presets:
            raise ValueError
    except (OSError, ValueError, TypeError, KeyError):
        raise WorkerError("SYNTHESIS_VOICES_UNAVAILABLE") from None
    return presets


def turbo_import_presets() -> list[dict]:
    """Convert SDK v3 Turbo presets to the bundle's declared `voices.json` shape."""
    try:
        return [
            {
                "id": name,
                "label": name,
                "speaker_emb": preset["speaker_emb"],
                "ref_codes": preset["codes"],
            }
            for name, preset in _sdk_presets(_TURBO_PRESETS).items()
        ]
    except (KeyError, TypeError):
        raise WorkerError("SYNTHESIS_VOICES_UNAVAILABLE") from None


def nano_import_presets() -> list[dict]:
    """Convert the SDK's v3 Nano presets; its float `style` token array keeps the declared key."""
    try:
        return [
            {
                "id": name,
                "label": name,
                "speaker_emb": preset["speaker_emb"],
                "style": preset["style"],
            }
            for name, preset in _sdk_presets(_NANO_PRESETS).items()
        ]
    except (KeyError, TypeError):
        raise WorkerError("SYNTHESIS_VOICES_UNAVAILABLE") from None


def _no_voices(_root: Path) -> list[dict]:
    return []


def _no_presets() -> list[dict]:
    return []


def _clone_adapter(_params, _model, _voice, _directory) -> dict:
    raise WorkerError("SYNTHESIS_CLONE_UNAVAILABLE")


@dataclass(frozen=True)
class SynthesisEngine:
    """One local synthesis architecture this build can run."""

    name: str
    directories: tuple[str, ...]
    files: frozenset[str]
    languages: tuple[str, ...]
    targets_duration: bool
    runtime_code: Callable[[], str | None]
    read_voices: Callable[[Path], list[dict]]
    import_presets: Callable[[], list[dict]]
    adapter: Callable[[dict, dict, dict, Path], dict]
    identity_fields: Mapping[str, object]


ENGINES: dict[str, SynthesisEngine] = {
    TURBO_ENGINE: SynthesisEngine(
        name=TURBO_ENGINE,
        directories=_TURBO_DIRECTORIES,
        files=frozenset(_TURBO_FILES),
        languages=("en", "vi"),
        targets_duration=False,
        runtime_code=turbo_runtime_code,
        read_voices=read_voices,
        import_presets=turbo_import_presets,
        adapter=vieneu_v3_turbo.run,
        identity_fields={"adapter": 1, "sdk": SDK_VERSION, "device": "cpu", "precision": "fp32"},
    ),
    NANO_ENGINE: SynthesisEngine(
        name=NANO_ENGINE,
        directories=_NANO_DIRECTORIES,
        files=frozenset(_NANO_FILES),
        languages=("vi",),
        targets_duration=True,
        runtime_code=nano_runtime_code,
        read_voices=read_nano_voices,
        import_presets=nano_import_presets,
        adapter=vieneu_v3_nano.run,
        identity_fields={
            "adapter": 1,
            "sdk": SDK_VERSION,
            "device": "cpu",
            "precision": "fp32",
            "targets_duration": 1,
        },
    ),
    # A companion descriptor only: it has no adapter and is never a synthesis engine itself.
    CLONE_ENGINE: SynthesisEngine(
        name=CLONE_ENGINE,
        directories=_CLONE_DIRECTORIES,
        files=frozenset(_CLONE_FILES),
        languages=("en", "vi"),
        targets_duration=False,
        runtime_code=clone_runtime_code,
        read_voices=_no_voices,
        import_presets=_no_presets,
        adapter=_clone_adapter,
        identity_fields={"adapter": 1, "sdk": SDK_VERSION, "device": "cpu", "precision": "fp32"},
    ),
}


def get_engine(name: object) -> SynthesisEngine:
    engine = ENGINES.get(name) if isinstance(name, str) else None
    if engine is None:
        raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
    return engine


def _atomic_write(target: Path, text: str, scratch: Path) -> None:
    """Write `text` to `target` atomically, staging in `scratch`."""
    pending = scratch / f".manifest-{uuid.uuid4()}.tmp"
    try:
        with pending.open("x", encoding="utf-8") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        pending.replace(target)
    finally:
        pending.unlink(missing_ok=True)


def materialise_voices(manifest: Path) -> None:
    """Complete a downloaded bundle whose `voices.json` is derived, not downloaded."""
    try:
        with manifest.open("rb") as stream:
            raw = stream.read(65537)
        value = json.loads(raw) if len(raw) <= 65536 else None
        if not isinstance(value, dict) or set(value) != FIELDS:
            raise ValueError
        engine = get_engine(value["engine"])
        directory, files = value["directory"], value["files"]
        if not isinstance(directory, str) or not directory or not isinstance(files, dict):
            raise ValueError
        root = Path(directory)
        if not root.is_absolute():
            root = manifest.parent / root
        root = root.resolve(strict=True)
        if (root / "voices.json").exists():
            return
        payload = json.dumps(
            {"voices": engine.import_presets()},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        _atomic_write(root / "voices.json", payload, manifest.parent)
        value["files"] = {**files, "voices.json": file_hash(root / "voices.json")}
        _atomic_write(manifest, json.dumps(value, ensure_ascii=False, indent=2), manifest.parent)
    except WorkerError:
        raise
    except (OSError, ValueError, TypeError):
        raise WorkerError("SYNTHESIS_MANIFEST_INVALID") from None


def inspect_files(bundle: dict, engine: SynthesisEngine) -> Path:
    try:
        root = Path(bundle["directory"])
        if root.is_symlink() or not root.is_dir() or root.resolve() != root:
            raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
        for folder in engine.directories:
            if (root / folder).is_symlink() or not (root / folder).is_dir():
                raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
        actual = set()
        for path in root.rglob("*"):
            name = path.relative_to(root).as_posix()
            if path.is_symlink() or (name not in engine.directories and name not in engine.files):
                raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
            if path.is_file():
                actual.add(name)
                limit = 4 * 1024**3 if path.suffix in (".onnx", ".data", ".npz") else 16 * 1024**2
                if not 0 < path.stat().st_size <= limit:
                    raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
        if actual != engine.files:
            raise WorkerError("MODEL_MISSING")
        return root
    except OSError:
        raise WorkerError("MODEL_MISSING") from None


def verify_bundle(bundle: dict, check=lambda: None) -> None:
    engine = get_engine(bundle.get("engine"))
    root = inspect_files(bundle, engine)
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
            if not isinstance(value, dict) or set(value) != FIELDS:
                raise ValueError
            engine = get_engine(value["engine"])
            langs, files, directory = value["languages"], value["files"], value["directory"]
            if (
                not isinstance(langs, list)
                or not 1 <= len(langs) <= len(engine.languages)
                or any(lang not in engine.languages for lang in langs)
                or len(set(langs)) != len(langs)
                or not isinstance(files, dict)
                or set(files) != engine.files
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
            inspect_files(bundle, engine)
            engine.read_voices(Path(bundle["directory"]))
            identity = {key: bundle[key] for key in ("engine", "languages", "files")}
            identity.update(engine.identity_fields)
            bundle["model_id"] = hashlib.sha256(
                json.dumps(identity, sort_keys=True).encode()
            ).hexdigest()
            return bundle
        except FileNotFoundError:
            raise WorkerError("MODEL_MISSING") from None
        except WorkerError:
            raise
        except (OSError, ValueError, TypeError):
            raise WorkerError("SYNTHESIS_MANIFEST_INVALID") from None

    def require(
        self,
        language: str,
        voice: str,
        expected_id: str,
        check=lambda: None,
        voice_data: dict | None = None,
    ) -> dict:
        check()
        bundle = self.read()
        engine = get_engine(bundle["engine"])
        if bundle["model_id"] != expected_id:
            raise WorkerError("SYNTHESIS_MODEL_CHANGED")
        if language not in bundle["languages"]:
            raise WorkerError("MODEL_LANGUAGE_UNAVAILABLE")
        # A stored clone is Turbo-only; presets keep resolving from the bundle.
        if voice_data is not None:
            if engine.name != TURBO_ENGINE:
                raise WorkerError("SYNTHESIS_CLONE_UNSUPPORTED_ENGINE")
        elif voice not in {v["id"] for v in engine.read_voices(Path(bundle["directory"]))}:
            raise WorkerError("SYNTHESIS_VOICE_UNAVAILABLE")
        verify_bundle(bundle, check)
        code = engine.runtime_code()
        if code:
            raise WorkerError(code)
        return bundle

    def status(self) -> dict:
        value = {
            "available": False,
            "code": None,
            "model_id": None,
            "engine": None,
            "languages": [],
            "voices": [],
            "verified": False,
        }
        try:
            bundle = self.read()
            engine = get_engine(bundle["engine"])
            value.update(
                model_id=bundle["model_id"],
                engine=bundle["engine"],
                languages=bundle["languages"],
                voices=[
                    {k: v[k] for k in ("id", "label")}
                    for v in engine.read_voices(Path(bundle["directory"]))
                ],
            )
            code = engine.runtime_code()
            if code:
                raise WorkerError(code)
            value["available"] = True
        except WorkerError as error:
            value["code"] = error.code
        return value


def configure_synthesis(host, req: dict) -> dict:
    p = exact(req["params"], {"path"})
    manifest = Path(string(p["path"]))
    materialise_voices(manifest)
    bundle = SynthesisRegistry(manifest).read()

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


def unconfigure_synthesis(host, req: dict) -> dict:
    """Forget the configured bundle when it is the one at `directory`."""
    p = exact(req["params"], {"directory"})
    directory = Path(string(p["directory"])).resolve()
    target = host.workspace / "local-synthesis.json"
    try:
        with target.open("rb") as stream:
            raw = stream.read(65537)
        value = json.loads(raw) if len(raw) <= 65536 else None
    except FileNotFoundError:
        value = None
    if value is not None:
        if not isinstance(value, dict):
            raise WorkerError("SYNTHESIS_MANIFEST_INVALID")
        stored = value.get("directory")
        if isinstance(stored, str) and Path(stored).resolve() == directory:
            target.unlink(missing_ok=True)
            host.synthesis_models = SynthesisRegistry(target)
    return host.synthesis_models.status()


def read_clone_bundle(manifest: Path) -> dict:
    """A verified companion bundle; the wrong engine or a tampered file reads as unavailable."""
    bundle = SynthesisRegistry(manifest).read()
    if bundle["engine"] != CLONE_ENGINE:
        raise WorkerError("SYNTHESIS_CLONE_UNAVAILABLE")
    verify_bundle(bundle)
    return bundle


def configure_clone(host, req: dict) -> dict:
    p = exact(req["params"], {"path"})
    manifest = Path(string(p["path"]))
    bundle = read_clone_bundle(manifest)

    def check():
        return host.cancelled(req)

    check()
    target = host.workspace / CLONE_MANIFEST_NAME
    temporary = target.with_name(f".{CLONE_MANIFEST_NAME}.{uuid.uuid4()}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump({key: bundle[key] for key in FIELDS}, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        check()
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return {"available": True}


def unconfigure_clone(host, req: dict) -> dict:
    p = exact(req["params"], {"directory"})
    directory = Path(string(p["directory"])).resolve()
    target = host.workspace / CLONE_MANIFEST_NAME
    try:
        raw = target.read_text(encoding="utf-8")
    except OSError:
        return {"available": False}
    try:
        stored = json.loads(raw).get("directory")
    except (ValueError, AttributeError):
        return {"available": False}
    if isinstance(stored, str) and Path(stored).resolve() == directory:
        target.unlink(missing_ok=True)
        return {"available": False}
    return {"available": True}
