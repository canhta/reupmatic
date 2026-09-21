"""Hosted protocol adapters: the wire shape an endpoint is spoken to in."""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request
from typing import Callable

from runtime.errors import WorkerError
from runtime.tls import https_context

_TIMEOUT = 60
_MAX_RESPONSE = 2 * 1024 * 1024


def _post_json(url: str, headers: dict[str, str], body: dict) -> dict:
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT, context=https_context()) as response:  # noqa: S310
            raw = response.read(_MAX_RESPONSE + 1)
    except urllib.error.HTTPError:
        # Never re-raise, log or echo the response body: it is untrusted remote content.
        raise WorkerError("MODEL_INFERENCE_FAILED") from None
    except (urllib.error.URLError, OSError, TimeoutError):
        raise WorkerError("MODEL_NETWORK_DISABLED") from None
    if len(raw) > _MAX_RESPONSE:
        raise WorkerError("MODEL_OUTPUT_INVALID")
    try:
        value = json.loads(raw)
    except ValueError:
        raise WorkerError("MODEL_OUTPUT_INVALID") from None
    if not isinstance(value, dict):
        raise WorkerError("MODEL_OUTPUT_INVALID")
    return value


def _dashscope(job: dict, credential: str) -> dict:
    """DashScope Qwen-Audio-ASR wire shape; transcript nests at `output.text`."""
    provider = job["provider"]
    with open(job["audio"], "rb") as stream:  # noqa: PTH123
        encoded = base64.b64encode(stream.read()).decode("ascii")
    url = (
        f"https://{provider['endpoint_host']}/api/v1/services/aigc/multimodal-generation/generation"
    )
    headers = {
        "Authorization": f"Bearer {credential}",
        "Content-Type": "application/json",
        "X-DashScope-SSE": "disable",
    }
    body = {
        "model": provider["remote_model_name"],
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": {"data": f"data:audio/wav;base64,{encoded}"},
                        }
                    ],
                }
            ]
        },
        "parameters": {"asr_options": {"enable_itn": False}},
    }
    value = _post_json(url, headers, body)
    output = value.get("output")
    text = None
    if isinstance(output, dict):
        text = output.get("text")
        if not isinstance(text, str):
            nested = output.get("output")
            sentence = nested.get("sentence") if isinstance(nested, dict) else None
            text = sentence.get("text") if isinstance(sentence, dict) else None
    if not isinstance(text, str):
        raise WorkerError("MODEL_OUTPUT_INVALID")
    return {"text": text, "runtime": f"dashscope;model={provider['remote_model_name']}"}


HOSTED_PROTOCOLS: dict[str, Callable[[dict, str], dict]] = {"dashscope": _dashscope}


def get_protocol(name: str) -> Callable[[dict, str], dict]:
    """Refuse an unimplemented protocol here too, as defence in depth."""
    try:
        return HOSTED_PROTOCOLS[name]
    except KeyError:
        raise WorkerError("MODEL_RUNTIME_MISSING") from None
