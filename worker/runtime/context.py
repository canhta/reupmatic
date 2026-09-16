from pathlib import Path
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from assets.registry import AssetRegistry
    from speech.recognition.models import SpeechRegistry
    from vision.models import ModelRegistry

    from runtime.process import ProcessRunner


class WorkerContext(Protocol):
    workspace: Path
    cache: Path
    ffmpeg: str
    ffprobe: str
    runtime_identity: str
    assets: "AssetRegistry"
    process: "ProcessRunner"
    models: "ModelRegistry"
    speech_models: "SpeechRegistry"

    def cancelled(self, request: dict) -> None: ...
    def emit(self, request: dict, event: str, data: Any) -> None: ...
