"""Explicit local CTranslate2 bundle ownership; discovery never downloads or infers.

A **manifest** is the single-engine file a user hand-prepares and points the app at
(`read_manifest`); an **engine store** (`SpeechEngines`) is the workspace-persisted,
multi-engine configuration `configure_speech` writes and every later request reads.
Configuring one engine never touches another engine's entry in that store.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping

from assets.registry import sha256 as file_hash
from runtime.errors import WorkerError
from runtime.protocol import exact, string
from speech.recognition.adapters import faster_whisper, qwen3_asr, qwen3_forced_aligner

LANGUAGES = {"en", "vi", "zh"}


@dataclass(frozen=True)
class EngineDescriptor:
    """What one speech engine needs from a bundle, and how to tell it's ready.

    A group in `required_groups` is satisfied by any one of its members being
    present (a plain required file is a group of one); `tolerated` files are
    permitted but never required. `runtime_probe` is stored as a zero-argument
    callable rather than a captured result so a test double can patch the
    module-level probe it wraps and still take effect.

    `adapter` is the engine's `transcribe(job)` callable, imported directly
    here so this descriptor is the *only* place an engine is registered: there
    is no second dispatch table for a build to let drift out of step. This
    holds while every engine runs in this same local inference child. A future
    engine that must run in a *different* child (a separate runner script,
    its own audit hook) cannot hand over a same-process callable at all, and
    will need this field to carry something else, e.g. a runner module name
    the parent launches instead of importing — a real design change for
    whichever ticket adds that engine, not a shape to guess at now.

    `provides_segments` says whether the engine's own output carries cue
    boundaries. Faster-whisper's does; Qwen3-ASR returns one whole-range pair,
    so its cue boundaries may only be derived from an aligner's word timings.
    An engine whose boundaries are its own is never re-segmented.
    """

    name: str
    required_groups: tuple[frozenset[str], ...]
    tolerated: frozenset[str]
    size_ceiling: Mapping[str, int]
    default_size_ceiling: int
    identity_fields: Mapping[str, object]
    runtime_probe: Callable[[], bool]
    adapter: Callable[[dict], dict]
    provides_segments: bool

    @property
    def allowed(self) -> frozenset[str]:
        return frozenset().union(*self.required_groups) | self.tolerated

    def size_limit(self, name: str) -> int:
        return self.size_ceiling.get(name, self.default_size_ceiling)

    def identity(self, files: dict, languages: list[str]) -> str:
        payload = {
            "engine": self.name,
            **self.identity_fields,
            "files": files,
            "languages": sorted(languages),
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def runtime_available() -> bool:
    try:
        return all(
            importlib.util.find_spec(name) is not None
            for name in ("faster_whisper", "ctranslate2", "tokenizers", "numpy", "av")
        )
    except (ImportError, ValueError):
        return False


def qwen3_asr_runtime_available() -> bool:
    try:
        return all(
            importlib.util.find_spec(name) is not None
            for name in ("qwen_asr", "torch", "transformers", "librosa", "soundfile")
        )
    except (ImportError, ValueError):
        return False


ENGINES: dict[str, EngineDescriptor] = {
    "faster-whisper": EngineDescriptor(
        name="faster-whisper",
        required_groups=(
            frozenset({"config.json"}),
            frozenset({"model.bin"}),
            frozenset({"tokenizer.json"}),
            frozenset({"vocabulary.json", "vocabulary.txt"}),
        ),
        tolerated=frozenset({"preprocessor_config.json"}),
        size_ceiling={"model.bin": 4 * 1024**3},
        default_size_ceiling=16 * 1024**2,
        identity_fields={"adapter": 1, "device": "cpu", "compute_type": "int8"},
        runtime_probe=lambda: runtime_available(),
        adapter=faster_whisper.transcribe,
        provides_segments=True,
    ),
    # Bundle layout is the real Qwen3-ASR-1.7B/0.6B repo layout on Hugging Face
    # (config.json/tokenizer_config.json/vocab.json/merges.txt always present;
    # 0.6B ships one model.safetensors, 1.7B ships it sharded with an index).
    # Bundle layout confirmed against the published repository file listing.
    "qwen3-asr": EngineDescriptor(
        name="qwen3-asr",
        required_groups=(
            frozenset({"config.json"}),
            frozenset({"tokenizer_config.json"}),
            frozenset({"vocab.json"}),
            frozenset({"merges.txt"}),
            frozenset({"model.safetensors", "model-00001-of-00002.safetensors"}),
        ),
        tolerated=frozenset(
            {
                "generation_config.json",
                "chat_template.json",
                "preprocessor_config.json",
                "model-00002-of-00002.safetensors",
                "model.safetensors.index.json",
            }
        ),
        size_ceiling={
            "model.safetensors": 4 * 1024**3,
            "model-00001-of-00002.safetensors": 4 * 1024**3,
            "model-00002-of-00002.safetensors": 4 * 1024**3,
        },
        default_size_ceiling=16 * 1024**2,
        identity_fields={"adapter": 1, "device": "cpu", "dtype": "float32"},
        runtime_probe=lambda: qwen3_asr_runtime_available(),
        adapter=qwen3_asr.transcribe,
        provides_segments=False,
    ),
    # Companion aligner for qwen3-asr: same file set as its 0.6B bundle above,
    # confirmed against the Hugging Face Qwen/Qwen3-ForcedAligner-0.6B file
    # listing (only size published; no sharded variant exists). Configured
    # and hash-verified through this same registry like any other engine, but
    # its `adapter` refuses direct dispatch — see
    # `adapters/qwen3_forced_aligner.py`.
    "qwen3-forced-aligner": EngineDescriptor(
        name="qwen3-forced-aligner",
        required_groups=(
            frozenset({"config.json"}),
            frozenset({"tokenizer_config.json"}),
            frozenset({"vocab.json"}),
            frozenset({"merges.txt"}),
            frozenset({"model.safetensors"}),
        ),
        tolerated=frozenset(
            {"generation_config.json", "chat_template.json", "preprocessor_config.json"}
        ),
        size_ceiling={"model.safetensors": 4 * 1024**3},
        default_size_ceiling=16 * 1024**2,
        identity_fields={"adapter": 1, "device": "cpu", "dtype": "float32"},
        runtime_probe=lambda: qwen3_asr_runtime_available(),
        adapter=qwen3_forced_aligner.transcribe,
        provides_segments=False,
    ),
}


def get_descriptor(engine: str) -> EngineDescriptor:
    try:
        return ENGINES[engine]
    except KeyError:
        raise WorkerError("MODEL_RUNTIME_MISSING") from None


def get_adapter(engine: str) -> Callable[[dict], dict]:
    return get_descriptor(engine).adapter


def verify_bundle(bundle: dict, check: Callable[[], None] = lambda: None) -> None:
    directory = Path(bundle["directory"])
    for name, expected in bundle["files"].items():
        check()
        if file_hash(directory / name, check) != expected:
            raise WorkerError("MODEL_HASH_MISMATCH")


def _resolve_bundle(
    engine: EngineDescriptor, directory: object, languages: object, files: object, base: Path
) -> dict:
    """Shared strict validation for one engine's directory/languages/files, used by
    both a hand-authored candidate manifest and a stored engine-store entry."""
    if (
        not isinstance(directory, str)
        or not directory
        or len(directory) > 4096
        or "\x00" in directory
        or "://" in directory
        or directory.startswith(("\\\\", "//"))
    ):
        raise ValueError
    if (
        not isinstance(languages, list)
        or not 1 <= len(languages) <= 3
        or any(not isinstance(lang, str) or lang not in LANGUAGES for lang in languages)
        or len(set(languages)) != len(languages)
    ):
        raise ValueError
    if (
        not isinstance(files, dict)
        or files.keys() - engine.allowed
        or any(not (group & files.keys()) for group in engine.required_groups)
        or any(
            not isinstance(v, str) or not re.fullmatch("[a-f0-9]{64}", v) for v in files.values()
        )
    ):
        raise ValueError
    root = Path(directory)
    if not root.is_absolute():
        root = base / root
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise WorkerError("MODEL_MISSING")
    for name in engine.allowed:
        file = root / name
        if name not in files:
            if file.exists():
                raise ValueError
            continue
        if not file.is_file():
            raise WorkerError("MODEL_MISSING")
        if file.resolve().parent != root or not 0 < file.stat().st_size <= engine.size_limit(name):
            raise ValueError
    return {
        "directory": str(root),
        "languages": languages,
        "files": files,
        "model_id": engine.identity(files, languages),
    }


def read_manifest(path: Path) -> dict:
    """Read and strictly validate a hand-authored, single-engine candidate manifest.

    This is the file format a user prepares and points the app at through the
    setup dialog — unrelated to the multi-engine store `SpeechEngines` persists.
    """
    try:
        with path.open("rb") as stream:
            raw = stream.read(65537)
        if len(raw) > 65536:
            raise ValueError
        value = json.loads(raw)
        if (
            not isinstance(value, dict)
            or set(value) != {"engine", "directory", "languages", "files"}
            or value["engine"] not in ENGINES
        ):
            raise ValueError
        engine = ENGINES[value["engine"]]
        bundle = _resolve_bundle(
            engine, value["directory"], value["languages"], value["files"], path.parent
        )
        return {"engine": value["engine"], **bundle}
    except FileNotFoundError:
        raise WorkerError("MODEL_MISSING") from None
    except (OSError, ValueError, TypeError):
        raise WorkerError("SPEECH_MANIFEST_INVALID") from None


class SpeechEngines:
    """Zero or more configured local engines, keyed by engine name.

    Persisted as one workspace file (`local-speech.json`):
    `{"engines": {<engine>: {"directory", "languages", "files"}}}`.
    Anything else fails loudly with `SPEECH_MANIFEST_INVALID`; an incompatible
    local configuration is reset by hand, never migrated, per the greenfield rule.
    """

    def __init__(self, path: Path):
        self.path = path

    def _read(self) -> dict[str, dict]:
        try:
            with self.path.open("rb") as stream:
                raw = stream.read(65537)
            if len(raw) > 65536:
                raise ValueError
            value = json.loads(raw)
            if (
                not isinstance(value, dict)
                or set(value) != {"engines"}
                or not isinstance(value["engines"], dict)
                or value["engines"].keys() - ENGINES.keys()
            ):
                raise ValueError
            result: dict[str, dict] = {}
            for name, entry in value["engines"].items():
                if not isinstance(entry, dict) or set(entry) != {"directory", "languages", "files"}:
                    raise ValueError
                result[name] = _resolve_bundle(
                    ENGINES[name],
                    entry["directory"],
                    entry["languages"],
                    entry["files"],
                    self.path.parent,
                )
            return result
        except FileNotFoundError:
            return {}
        except (OSError, ValueError, TypeError):
            raise WorkerError("SPEECH_MANIFEST_INVALID") from None

    def require(
        self,
        model_id: str,
        language: str,
        *,
        verify: bool = True,
        runtime: bool = True,
        check: Callable[[], None] = lambda: None,
    ) -> dict:
        check()
        configured = self._read()
        for name, bundle in configured.items():
            if bundle["model_id"] != model_id:
                continue
            if language not in bundle["languages"]:
                raise WorkerError("MODEL_LANGUAGE_UNAVAILABLE")
            if verify:
                verify_bundle(bundle, check)
            if runtime and not ENGINES[name].runtime_probe():
                raise WorkerError("MODEL_RUNTIME_MISSING")
            return {**bundle, "engine": name}
        # No configured engine claims this identity: either nothing was ever
        # configured for it, or the owning engine has since been reconfigured
        # to a different bundle. Both are the same user-facing situation the
        # existing code already names.
        raise WorkerError("SPEECH_MODEL_CHANGED")

    def optional(
        self, engine: str, language: str, *, check: Callable[[], None] = lambda: None
    ) -> dict | None:
        """A configured companion engine (e.g. `qwen3-forced-aligner`) for the
        primary request's language, or `None` when it is simply not there to
        help: not configured, its runtime is absent, or it does not declare
        that language. Unlike `require`, absence is never an error — a
        companion engine is a bonus for whichever primary engine can use it,
        never a precondition for that engine's own transcript: one engine's weak or missing config must not fail
        another's job.
        A *configured* bundle that fails hash verification still raises, the
        same as any other engine: tampering is caught regardless of whether
        the engine is primary or a companion.
        """
        check()
        configured = self._read()
        bundle = configured.get(engine)
        if (
            bundle is None
            or language not in bundle["languages"]
            or not ENGINES[engine].runtime_probe()
        ):
            return None
        verify_bundle(bundle, check)
        return {**bundle, "engine": engine}

    def status(self) -> dict:
        try:
            configured = self._read()
        except WorkerError as error:
            return {
                "engines": [
                    {
                        "engine": name,
                        "available": False,
                        "code": error.code,
                        "model_id": None,
                        "languages": [],
                        "verified": False,
                    }
                    for name in ENGINES
                ]
            }
        entries = []
        for name, descriptor in ENGINES.items():
            bundle = configured.get(name)
            if bundle is None:
                entries.append(
                    {
                        "engine": name,
                        "available": False,
                        "code": "MODEL_MISSING",
                        "model_id": None,
                        "languages": [],
                        "verified": False,
                    }
                )
                continue
            if not descriptor.runtime_probe():
                entries.append(
                    {
                        "engine": name,
                        "available": False,
                        "code": "MODEL_RUNTIME_MISSING",
                        "model_id": bundle["model_id"],
                        "languages": bundle["languages"],
                        "verified": False,
                    }
                )
                continue
            entries.append(
                {
                    "engine": name,
                    "available": True,
                    "code": None,
                    "model_id": bundle["model_id"],
                    "languages": bundle["languages"],
                    "verified": False,
                }
            )
        return {"engines": entries}


def _write_engines(target: Path, engines: dict) -> None:
    """Atomically replace the engine store with `engines`. One writer, used by configure and
    unconfigure alike, so both leave the same shape behind."""
    value = {
        "engines": {
            name: {"directory": e["directory"], "languages": e["languages"], "files": e["files"]}
            for name, e in engines.items()
        },
    }
    temporary = target.with_name(f".local-speech-{uuid.uuid4()}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def configure_speech(host, req: dict) -> dict:
    params = exact(req["params"], {"path"})
    source = Path(string(params["path"]))
    bundle = read_manifest(source)
    engine = bundle["engine"]

    def check():
        return host.cancelled(req)

    verify_bundle(bundle, check)
    target = host.workspace / "local-speech.json"
    store = SpeechEngines(target)
    # Propagates loudly (SPEECH_MANIFEST_INVALID) when an existing store is
    # unreadable or still in the previous single-engine shape: this action
    # configures one engine, it does not silently discard an incompatible
    # store nor the other engines already recorded in a valid one.
    existing = store._read()
    engines = {
        **existing,
        engine: {
            "directory": bundle["directory"],
            "languages": bundle["languages"],
            "files": bundle["files"],
        },
    }
    check()
    _write_engines(target, engines)
    host.speech_models = SpeechEngines(target)
    return host.speech_models.status()


def _raw_engines(target: Path) -> dict:
    """Read the store's entries without resolving their bundles, so a store whose files are already
    gone can still be cleaned. `_read` is strict because a *run* must not use a broken bundle; a
    *forget* must be able to drop one."""
    try:
        with target.open("rb") as stream:
            raw = stream.read(65537)
        value = json.loads(raw) if len(raw) <= 65536 else None
    except FileNotFoundError:
        return {}
    if (
        not isinstance(value, dict)
        or set(value) != {"engines"}
        or not isinstance(value["engines"], dict)
    ):
        raise WorkerError("SPEECH_MANIFEST_INVALID")
    return value["engines"]


def unconfigure_speech(host, req: dict) -> dict:
    """Forget the engine entry pointing at `directory`, so the bundle can be deleted without
    leaving the store pointing at files that no longer exist. Only an entry whose directory
    matches is removed; a hand-written manifest configured elsewhere is untouched."""
    params = exact(req["params"], {"directory"})
    directory = Path(string(params["directory"])).resolve()
    target = host.workspace / "local-speech.json"
    existing = _raw_engines(target)
    remaining = {
        name: entry
        for name, entry in existing.items()
        if not (
            isinstance(entry, dict)
            and isinstance(entry.get("directory"), str)
            and Path(entry["directory"]).resolve() == directory
        )
    }
    if len(remaining) != len(existing):
        _write_engines(target, remaining)
        host.speech_models = SpeechEngines(target)
    return host.speech_models.status()
