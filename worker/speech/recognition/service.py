"""Source-clock audio extraction and local recognition through the shared worker queue."""

from __future__ import annotations

import json
import re
import shutil
import sys
import tempfile
import wave
from pathlib import Path

from media.probe import probe_file
from runtime.errors import WorkerError
from runtime.protocol import bounded_int, exact, string
from subtitles.validation import validate_cues

MAX_RESULT = 1000000
MAX_DURATION = 7200000


def _parse_provider(value: object, duration_ms: int) -> dict:
    """Shape validation for the one job's hosted-provider config `SpeechCoordinator` attaches
    (never persisted; see `transcribe`'s job-file construction below, which excludes this dict's
    sibling `credential` field entirely). Mirrors `app/core/speech/providers.ts`'s
    `parseProviderDraft`/`parseModelDraft` bounds — defence in depth, since the core already
    validated the provider/model this came from before ever sending this request.
    """
    p = exact(value, {"protocol", "endpoint_host", "remote_model_name", "max_duration_ms"})
    string(p["protocol"], 64)
    endpoint_host = string(p["endpoint_host"], 255)
    string(p["remote_model_name"], 128)
    max_duration_ms = bounded_int(p["max_duration_ms"], 1000, MAX_DURATION - 1)
    if "/" in endpoint_host or " " in endpoint_host:
        raise WorkerError("INVALID_REQUEST")
    if duration_ms > max_duration_ms:
        # The cloud duration bound (spec "Error vocabulary"): a distinct, user-actionable
        # refusal, raised here before any audio is decoded or sent — `transcribe` calls this
        # before `probe_file`/`decode_audio` run. `SpeechCoordinator` already checks the same
        # bound before ever asking the worker to run a job; this is defence in depth for a
        # request that reaches the worker directly (as this suite's own tests do).
        raise WorkerError("SPEECH_CLOUD_LIMIT")
    return dict(p)


def parse_options(value: object) -> dict:
    base = {"asset_id", "source_sha256", "model_id", "start_ms", "end_ms", "language"}
    p = exact(value, base, {"provider", "credential"})
    if ("provider" in p) != ("credential" in p):
        raise WorkerError("INVALID_REQUEST")
    string(p["asset_id"], 128)
    start = bounded_int(p["start_ms"], 0, 86400000)
    end = bounded_int(p["end_ms"], 1, 86400000)
    if (
        end <= start
        or p["language"] not in ("en", "vi", "zh")
        or any(
            not isinstance(p[key], str) or not re.fullmatch("[a-f0-9]{64}", p[key])
            for key in ("source_sha256", "model_id")
        )
    ):
        raise WorkerError("INVALID_REQUEST")
    if end - start > MAX_DURATION:
        raise WorkerError("SPEECH_LIMIT")
    result = dict(p)
    if "provider" in p:
        result["provider"] = _parse_provider(p["provider"], end - start)
        if (
            not isinstance(p["credential"], str)
            or not p["credential"]
            or len(p["credential"]) > 4096
        ):
            raise WorkerError("INVALID_REQUEST")
    return result


def decode_audio(host, req: dict, source: Path, start_ms: int, end_ms: int, target: Path) -> None:
    duration = (end_ms - start_ms) / 1000
    # Normalize the original audio clock before trimming. first_pts preserves delayed
    # audio as silence; seeking straight to its first packet would shift every cue.
    filters = (
        f"aresample=16000:async=1:first_pts=0,apad,"
        f"atrim=start={start_ms / 1000}:end={end_ms / 1000},asetpts=PTS-STARTPTS"
    )
    host.process.run(
        req,
        [
            host.ffmpeg,
            "-v",
            "error",
            "-nostdin",
            "-threads",
            "2",
            "-i",
            str(source),
            "-map",
            "0:a:0",
            "-vn",
            "-sn",
            "-dn",
            "-af",
            filters,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            "-t",
            str(duration),
            "-map_metadata",
            "-1",
            "-threads",
            "1",
            "-n",
            str(target),
        ],
        timeout=3600,
    )
    with wave.open(str(target), "rb") as audio:
        if (
            audio.getnchannels() != 1
            or audio.getsampwidth() != 2
            or audio.getframerate() != 16000
            or abs(audio.getnframes() - round(duration * 16000)) > 32
        ):
            raise WorkerError("SPEECH_AUDIO_INVALID")


def read_result(filename: Path, start_ms: int, end_ms: int) -> dict:
    with filename.open("rb") as stream:
        raw = stream.read(MAX_RESULT + 1)
    if len(raw) > MAX_RESULT:
        raise WorkerError("SPEECH_RESULT_TOO_LARGE")
    try:
        response = json.loads(raw)
    except ValueError:
        raise WorkerError("MODEL_OUTPUT_INVALID") from None
    if not isinstance(response, dict):
        raise WorkerError("MODEL_OUTPUT_INVALID")
    if response.get("ok") is not True:
        known = {
            "MODEL_HASH_MISMATCH",
            "MODEL_RUNTIME_MISSING",
            "MODEL_INFERENCE_FAILED",
            "MODEL_NETWORK_DISABLED",
            "MODEL_LANGUAGE_UNAVAILABLE",
            "SPEECH_RESULT_TOO_LARGE",
            "SPEECH_TIMING_INVALID",
        }
        code = response.get("code")
        raise WorkerError(
            code if isinstance(code, str) and code in known else "MODEL_INFERENCE_FAILED"
        )
    data = response.get("data")
    if not isinstance(data, dict) or set(data) != {"cues", "runtime", "words", "aligner_model_id"}:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    validate_cues(data["cues"])
    if (
        not isinstance(data["runtime"], str)
        or not 0 < len(data["runtime"]) <= 128
        or "\x00" in data["runtime"]
    ):
        raise WorkerError("MODEL_OUTPUT_INVALID")
    aligner_model_id = data["aligner_model_id"]
    if aligner_model_id is not None and (
        not isinstance(aligner_model_id, str) or not re.fullmatch("[a-f0-9]{64}", aligner_model_id)
    ):
        raise WorkerError("MODEL_OUTPUT_INVALID")
    cue_bounds: dict[str, tuple[int, int]] = {}
    previous = start_ms
    for cue in data["cues"]:
        if (
            "style" in cue
            or not cue["text"].strip()
            or cue["start_ms"] < previous
            or cue["end_ms"] > end_ms
        ):
            raise WorkerError("SPEECH_TIMING_INVALID")
        cue_bounds[cue["id"]] = (cue["start_ms"], cue["end_ms"])
        previous = cue["end_ms"]
    words = data["words"]
    if not isinstance(words, list) or len(words) > 100000:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    word_previous: dict[str, int] = {}
    for word in words:
        if (
            not isinstance(word, dict)
            or set(word) != {"cue_id", "start_ms", "end_ms", "text"}
            or word["cue_id"] not in cue_bounds
            or type(word["start_ms"]) is not int
            or type(word["end_ms"]) is not int
            or not isinstance(word["text"], str)
            or not word["text"]
            or len(word["text"]) > 1000
            or "\x00" in word["text"]
        ):
            raise WorkerError("MODEL_OUTPUT_INVALID")
        cue_start, cue_end = cue_bounds[word["cue_id"]]
        low = word_previous.get(word["cue_id"], cue_start)
        if word["start_ms"] < low or word["end_ms"] <= word["start_ms"] or word["end_ms"] > cue_end:
            raise WorkerError("SPEECH_TIMING_INVALID")
        word_previous[word["cue_id"]] = word["end_ms"]
    if words and aligner_model_id is None:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    return data


def transcribe(host, req: dict) -> dict:
    p = parse_options(req["params"])
    # Never part of `p` past this point: `credential` never reaches the job file below (it is
    # handed to `host.process.run` as the hosted child's own environment instead — D-55), and
    # `provider` is re-attached to the job dict explicitly, never to `result`'s spread of `p`,
    # so a hosted result keeps exactly the same public shape a local one already has.
    credential = p.pop("credential", None)
    provider = p.pop("provider", None)

    def check():
        return host.cancelled(req)

    source = host.assets.verify(p["asset_id"], "video", check)
    if source["sha256"] != p["source_sha256"]:
        raise WorkerError("SOURCE_CHANGED")
    info = probe_file(host, req, source["path"])
    if p["end_ms"] > info["duration_ms"]:
        raise WorkerError("INVALID_REQUEST")
    if not info["has_audio"]:
        raise WorkerError("NO_AUDIO")
    if provider is None:
        model = host.speech_models.require(p["model_id"], p["language"], check=check)
        # Only the engine that actually knows how to use a forced aligner ever
        # resolves one: an unrelated engine's request must never fail (hash
        # mismatch) or behave differently because of a companion bundle it never
        # asked for.
        aligner = (
            host.speech_models.optional("qwen3-forced-aligner", p["language"], check=check)
            if model["engine"] == "qwen3-asr"
            else None
        )
    else:
        # A hosted job names no local bundle at all: its identity, languages and duration bound
        # were already resolved and checked by `SpeechCoordinator`/`_parse_provider` above, from
        # the BYOK/BYO-model registry (`app/electron/features/speech/provider-store.ts`), not
        # from `host.speech_models`.
        model = None
        aligner = None
    duration = p["end_ms"] - p["start_ms"]
    if shutil.disk_usage(host.workspace).free < duration * 32 + 64 * 1024**2:
        raise WorkerError("SPEECH_DISK_LOW")

    def emit(phase, fraction):
        return host.emit(req, "progress", {"phase": phase, "fraction": fraction})

    with tempfile.TemporaryDirectory(dir=host.workspace, prefix="speech-") as directory:
        tmp = Path(directory)
        audio = tmp / "input.wav"
        emit("speechDecoding", None)
        decode_audio(host, req, source["path"], p["start_ms"], p["end_ms"], audio)
        check()
        if provider is None:
            job = {**p, "model": model, "aligner": aligner, "audio": str(audio)}
            module = "speech.recognition.runner"
            child_env = None
            child_timeout = 7200
        else:
            # `credential` is deliberately absent from this dict: it never reaches
            # `job_path` on disk, which lands in the workspace (D-55). The hosted child
            # receives it only through `host.process.run`'s own `env`, below.
            job = {**p, "provider": provider, "audio": str(audio)}
            module = "speech.recognition.hosted_runner"
            child_env = {"REUPMATIC_SPEECH_PROVIDER_CREDENTIAL": credential}
            child_timeout = 180
        job_path = tmp / "request.json"
        job_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        emit("speechRecognizing", None)
        last = -1

        def progress():
            nonlocal last
            try:
                with (tmp / "progress.json").open("rb") as stream:
                    value = json.loads(stream.read(1024))
                completed = value.get("completed_ms")
                if (
                    type(completed) is int
                    and last < completed <= duration
                    and value.get("duration_ms") == duration
                ):
                    last = completed
                    emit("speechRecognizing", completed / duration)
            except (OSError, ValueError, AttributeError):
                pass

        host.process.run(
            req,
            [sys.executable, "-u", "-m", module, str(job_path)],
            cwd=Path(__file__).resolve().parents[2],
            timeout=child_timeout,
            on_poll=progress,
            env=child_env,
        )
        progress()
        check()
        data = read_result(tmp / "result.json", p["start_ms"], p["end_ms"])
        host.assets.verify(p["asset_id"], "video", check)
        result = {"kind": "stt", **p, **data, "clock": "source", "timing": "segment"}
        if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > MAX_RESULT:
            raise WorkerError("SPEECH_RESULT_TOO_LARGE")
        check()
        return result
