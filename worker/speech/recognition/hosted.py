"""Hosted protocol adapters: the wire shape an endpoint is spoken to in (D-55 — code), kept
apart from which provider, host, model name and credential a user configures (data, held in
`app/electron/features/speech/provider-store.ts` and carried per job by `SpeechCoordinator`).

Runs only inside `speech.recognition.hosted_runner`'s separate, narrowly-sandboxed child
(`runtime.hosted_egress`) — never inside the local inference child
(`speech.recognition.runner`), which this module does not import and is not imported by.

DashScope is the first protocol implemented. Adding a second is one more entry in
`HOSTED_PROTOCOLS` plus its own function here, never a change to how a provider or model is
configured; `app/core/speech/providers.ts`'s `IMPLEMENTED_PROTOCOLS` names it the same way.
"""

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
        # A rejected credential or a remote refusal (spec "Error vocabulary"). The response body
        # is never re-raised, logged or echoed: it is untrusted remote content that may carry
        # nothing useful and must never carry a credential back out through an error message.
        raise WorkerError("MODEL_INFERENCE_FAILED") from None
    except (urllib.error.URLError, OSError, TimeoutError):
        # A real network failure (DNS, refused connection, timeout) maps to the same existing
        # code the audit hook itself raises directly when it denies a socket — `WorkerError` is
        # not an `OSError`, so that denial propagates through this function unmodified rather
        # than through this branch, and lands on `MODEL_NETWORK_DISABLED` either way.
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
    """Qwen-Audio-ASR-Flash/Fun-ASR-Flash's DashScope wire shape: one synchronous
    multimodal-generation call with the audio inlined as a `data:<mime>;base64,` URI (verified
    against Alibaba Cloud Model Studio's published request/response shape). This
    model family's response nests its transcript at the
    top-level `output.text`, falling back to `output.output.sentence.text` when that model
    variant omits the top-level field, exactly as the vendor documentation describes; there is
    no `choices` field the way a standard DashScope multimodal response has one.
    """
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


# Every protocol this build can actually speak to a hosted endpoint (D-55). Kept in step with
# `app/core/speech/providers.ts`'s `IMPLEMENTED_PROTOCOLS` by hand — the two have no shared
# schema, the same relationship `worker/runtime/errors.py` and `error-codes.ts` already have.
HOSTED_PROTOCOLS: dict[str, Callable[[dict, str], dict]] = {"dashscope": _dashscope}


def get_protocol(name: str) -> Callable[[dict, str], dict]:
    """Refuses an unimplemented protocol here too, in the child, as defence in depth: the core
    already refuses one at configuration time (`assertProtocolImplemented`) and again before
    dispatching a job (`SpeechCoordinator.hostedParams`); a stored provider naming a protocol
    this build no longer implements must still fail loudly rather than run half-supported.
    """
    try:
        return HOSTED_PROTOCOLS[name]
    except KeyError:
        raise WorkerError("MODEL_RUNTIME_MISSING") from None
