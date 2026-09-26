"""Reference-clip cloning through a cancellable offline child; local Turbo only."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

from media.audio.soundtrack import probe_audio
from runtime.errors import WorkerError
from runtime.protocol import exact, string
from speech.synthesis.contracts import parse_voice
from speech.synthesis.models import TURBO_ENGINE, get_engine, verify_bundle

CLONE_MIN_MS = 3000
CLONE_MAX_MS = 8000
MAX_RESULT = 16 * 1024**2
CLONE_ERRORS = {
    "MODEL_HASH_MISMATCH",
    "MODEL_RUNTIME_MISSING",
    "MODEL_INFERENCE_FAILED",
    "MODEL_NETWORK_DISABLED",
    "MODEL_OUTPUT_INVALID",
    "SYNTHESIS_RUNTIME_VERSION",
    "SYNTHESIS_CLONE_INVALID",
}


def read_clone_result(path: Path) -> dict:
    try:
        with path.open("rb") as stream:
            raw = stream.read(MAX_RESULT + 1)
        response = json.loads(raw) if len(raw) <= MAX_RESULT else None
        if not isinstance(response, dict):
            raise ValueError
        if response.get("ok") is not True:
            code = response.get("code")
            raise WorkerError(
                code if isinstance(code, str) and code in CLONE_ERRORS else "MODEL_INFERENCE_FAILED"
            )
        if set(response) != {"ok", "data"}:
            raise ValueError
        return parse_voice(response["data"])
    except (OSError, ValueError, TypeError):
        raise WorkerError("MODEL_OUTPUT_INVALID") from None


def clone_voice(host, req: dict) -> dict:
    p = exact(req["params"], {"asset_id"})
    asset_id = string(p["asset_id"], 128)

    def check():
        return host.cancelled(req)

    bundle = host.synthesis_models.read()
    engine = get_engine(bundle["engine"])
    # Nano's cloning graphs download on first use; this build never downloads silently.
    if engine.name != TURBO_ENGINE:
        raise WorkerError("SYNTHESIS_CLONE_UNSUPPORTED_ENGINE")
    verify_bundle(bundle, check)
    code = engine.runtime_code()
    if code:
        raise WorkerError(code)
    source = host.assets.verify(asset_id, "audio", check)
    info = probe_audio(host, req, source["path"])
    if not CLONE_MIN_MS <= info["duration_ms"] <= CLONE_MAX_MS:
        raise WorkerError("SYNTHESIS_CLONE_AUDIO_INVALID")
    if shutil.disk_usage(host.workspace).free < 64 * 1024**2:
        raise WorkerError("SYNTHESIS_DISK_LOW")
    root = host.workspace / "speech"
    root.mkdir(exist_ok=True)
    if root.is_symlink() or root.resolve().parent != host.workspace.resolve():
        raise WorkerError("SYNTHESIS_ARTIFACT_INVALID")
    host.emit(req, "progress", {"phase": "synthesisCloning", "fraction": None})
    with tempfile.TemporaryDirectory(dir=root, prefix=".clone-") as directory:
        tmp = Path(directory)
        path = tmp / "request.json"
        path.write_text(
            json.dumps(
                {"audio": str(source["path"]), "root": bundle["directory"], "denoise": True},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        host.process.run(
            req,
            [sys.executable, "-u", "-m", "speech.synthesis.clone_runner", str(path)],
            cwd=Path(__file__).resolve().parents[2],
            timeout=1800,
        )
        check()
        return read_clone_result(tmp / "result.json")
