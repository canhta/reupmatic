"""Home for adapter modules. Dispatch lives in `speech.recognition.models.ENGINES`.

Each adapter module exposes one `transcribe(job)` that returns
`{"segments": <iterable of objects with .start/.end/.text, optionally .words>,
"runtime": <str>}`. Adding an engine means adding a module here and one
`EngineDescriptor` entry in `models.ENGINES` (its `adapter` field points
straight at this module's `transcribe`) — never a second registry that the
two can drift apart from. A companion engine that only ever augments another
engine's job (`qwen3_forced_aligner`, used by `qwen3_asr`) still gets its own
module and descriptor for configuration/hash-verification/status, but its own
`transcribe` refuses direct dispatch rather than pretending to recognise
audio on its own.
"""

from __future__ import annotations
