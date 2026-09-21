"""Home for synthesis adapter modules. Dispatch lives in `speech.synthesis.models.ENGINES`.

Each adapter module exposes one `run(params, model, voice, directory)` that
writes `speech.wav` into `directory` and returns
`{"frames", "sample_rate", "segments", "runtime"}` — the metadata
`speech.synthesis.contracts.validate_audio` then validates against the request.
Adding an engine means adding a module here and one `SynthesisEngine` entry in
`models.ENGINES` (its `adapter` field points straight at this module's `run`) —
never a second registry the two can drift apart from. The descriptor keeps the
per-engine bundle layout and voice schema; the adapter keeps execution.
"""
