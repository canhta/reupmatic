import importlib.util
import json
import os
import queue
import subprocess
import threading
from functools import partial
from pathlib import Path
from typing import Any

from assets.registry import AssetRegistry
from media.peaks import peaks
from media.audio.soundtrack import probe as probe_audio
from media.probe import probe
from media.render import render
from processing.service import process_video
from processing.recipe import model_snapshot
from runtime.errors import WorkerError
from runtime.process import ProcessRunner, runtime_identity
from runtime.protocol import MAX_JOBS, PROTOCOL, bounded_int, exact, string
from subtitles.service import load_subtitles, preview_subtitles, save_subtitles, prepare_subtitles
from vision.models import ModelRegistry
from vision.configuration import configure_models
from vision.service import VisionService
from vision.extraction import extract_ocr
from speech.recognition.models import SpeechRegistry, configure_speech
from speech.recognition.service import transcribe
from speech.translation.models import TranslationRegistry, configure_translation
from speech.translation.service import translate
from speech.synthesis.models import SynthesisRegistry, configure_synthesis
from speech.synthesis.service import synthesize


class Worker:
    def __init__(self, workspace: Path, ffmpeg: str = "ffmpeg", ffprobe: str = "ffprobe"):
        self.workspace = workspace.resolve()
        self.workspace.mkdir(parents=True, exist_ok=True)
        self.cache = self.workspace / "renders"
        self.cache.mkdir(exist_ok=True)
        self.ffmpeg, self.ffprobe = ffmpeg, ffprobe
        self.assets = AssetRegistry()
        self.jobs: queue.Queue = queue.Queue(maxsize=MAX_JOBS)
        self.cancel_flags: dict[str, threading.Event] = {}
        self.seen: set[str] = set()
        self.lock = threading.RLock()
        self.output_lock = threading.Lock()
        self.process = ProcessRunner(self.cancelled)
        self.closed = False
        self.runtime_identity = runtime_identity(ffmpeg)
        saved_models = self.workspace / "local-models.json"
        default_models = saved_models if saved_models.is_file() else Path(__file__).resolve().parents[2] / "models" / "local.json"
        self.models = ModelRegistry(Path(os.environ.get("REUPMATIC_MODEL_MANIFEST", str(default_models))))
        self.vision = VisionService(self)
        self.synthesis_models = SynthesisRegistry(self.workspace / 'local-synthesis.json')
        self.translation_models = TranslationRegistry(self.workspace / 'local-translation.json')
        self.speech_models = SpeechRegistry(self.workspace / "local-speech.json")
        self.thread = threading.Thread(target=self._loop, name="media-worker", daemon=False)
        self.thread.start()

    def emit(self, req: dict, event: str, data: Any) -> None:
        rid = req.get("id")
        rev = req.get("revision")
        if not isinstance(rid, str) or not rid or len(rid) > 128:
            rid = "invalid"
        if type(rev) is not int or not 0 <= rev <= 2**31 - 1:
            rev = 0
        message = {"v": PROTOCOL, "id": rid, "revision": rev, "event": event, "data": data}
        with self.output_lock:
            try:
                print(json.dumps(message, ensure_ascii=False, allow_nan=False), flush=True)
            except BrokenPipeError:
                self.closed = True

    def accept(self, req: Any) -> None:
        try:
            exact(req, {"v", "id", "revision", "method", "params"})
            if type(req["v"]) is not int or req["v"] != PROTOCOL:
                raise WorkerError("PROTOCOL_VERSION")
            rid = string(req["id"], 128)
            bounded_int(req["revision"], 0, 2**31 - 1)
            method = string(req["method"], 64)
            if method not in {"synthesis.status", "synthesis.configure", "speech.synthesize", "translation.status", "translation.configure", "speech.translate", "speech.status", "speech.configure", "speech.transcribe", "media.process", "models.resolve", "media.ocr.extract", "media.ocr", "media.inpaint", "models.status", "models.configure", "hello", "asset.register", "media.probe", "media.peaks", "subtitles.load", "subtitles.save", "subtitles.preview", "subtitles.prepare", "audio.probe", "media.render", "cancel"}:
                raise WorkerError("METHOD_UNAVAILABLE")
            with self.lock:
                if rid in self.seen:
                    raise WorkerError("DUPLICATE_REQUEST")
                # Session safety bound; restart/re-register instead of unbounded bookkeeping.
                if len(self.seen) >= 10000:
                    raise WorkerError("SESSION_LIMIT")
                self.seen.add(rid)
            if method == "synthesis.status":
                exact(req["params"], set())
                self.emit(req, "result", self.synthesis_models.status())
                return
            if method == "translation.status":
                exact(req["params"], set())
                self.emit(req, "result", self.translation_models.status())
                return
            if method == "speech.status":
                exact(req["params"], set())
                self.emit(req, "result", self.speech_models.status())
                return
            if method == "models.status":
                exact(req["params"], set())
                self.emit(req, "result", self.models.status())
                return
            if method == "hello":
                exact(req["params"], set())
                self.emit(req, "result", {"protocol": PROTOCOL, "ffmpeg": self.runtime_identity != "unavailable", "pysubs2": importlib.util.find_spec("pysubs2") is not None, "ocr": self.models.status()["ocr"]["available"], "inpainting": self.models.status()["inpainting"]["available"], "durable_jobs": False})
                return
            if method == "cancel":
                exact(req["params"], {"request_id"})
                target = string(req["params"]["request_id"], 128)
                with self.lock:
                    flag = self.cancel_flags.get(target)
                    if flag:
                        flag.set()
                self.process.cancel(target)
                self.emit(req, "result", {"requested": bool(flag), "request_id": target})
                return
            with self.lock:
                self.cancel_flags[rid] = threading.Event()
            try:
                if self.jobs.full():
                    raise queue.Full
                self.emit(req, "progress", {"phase": "queued", "fraction": None})
                self.jobs.put_nowait(req)
            except queue.Full:
                with self.lock:
                    self.cancel_flags.pop(rid, None)
                raise WorkerError("QUEUE_FULL")
        except WorkerError as exc:
            fallback = req if isinstance(req, dict) else {}
            if not isinstance(fallback.get("id"), str):
                fallback = {"id": "invalid", "revision": 0}
            self.emit(fallback, "error", {"code": exc.code})

    def cancelled(self, req: dict) -> None:
        flag = self.cancel_flags.get(req["id"])
        if self.closed or (flag and flag.is_set()):
            raise WorkerError("CANCELLED")

    def _loop(self) -> None:
        while True:
            req = self.jobs.get()
            if req is None:
                self.jobs.task_done()
                return
            try:
                self.cancelled(req)
                self.emit(req, "progress", {"phase": "running", "fraction": None})
                handler = {"synthesis.configure": partial(configure_synthesis, self), "speech.synthesize": partial(synthesize, self), "translation.configure": partial(configure_translation, self), "speech.translate": partial(translate, self), "speech.configure": partial(configure_speech, self), "speech.transcribe": partial(transcribe, self), "media.ocr.extract": partial(extract_ocr, self), "media.process": partial(process_video, self), "models.resolve": partial(model_snapshot, self), "models.configure": partial(configure_models, self), "media.ocr": self.vision.run, "media.inpaint": self.vision.run, "asset.register": self.assets.register, "media.probe": partial(probe, self),
                           "media.peaks": partial(peaks, self), "audio.probe": partial(probe_audio, self), "subtitles.load": partial(load_subtitles, self),
                           "subtitles.save": partial(save_subtitles, self), "subtitles.prepare": partial(prepare_subtitles, self), "subtitles.preview": partial(preview_subtitles, self), "media.render": partial(render, self)}[req["method"]]
                data = handler(req)
                self.emit(req, "result", data)
            except WorkerError as exc:
                self.emit(req, "error", {"code": exc.code})
            except (OSError, subprocess.SubprocessError, ValueError, KeyError):
                self.emit(req, "error", {"code": "WORKER_FAILURE"})
            except Exception:
                # Protocol survives a bad item; no source contents/secrets in stdout logs.
                self.emit(req, "error", {"code": "WORKER_FAILURE"})
            finally:
                with self.lock:
                    self.cancel_flags.pop(req["id"], None)
                self.jobs.task_done()

    def close(self) -> None:
        self.closed = True
        with self.lock:
            for flag in self.cancel_flags.values():
                flag.set()
        self.process.cancel()
        self.jobs.put(None)
        self.thread.join(timeout=12)
