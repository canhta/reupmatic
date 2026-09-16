# Local model setup — development only

Read `specs/local-vision.md` for bounds and `research/integration-0.7/RESULTS.md`
for verification. This archive contains adapters, not model weights or an approved
AI runtime lock. Core video rendering does not require the vision packages.

## Runtime requirements

The vision subprocess imports `rapidocr` (the RapidOCR package with the
`RapidOCR(params=...)` API), `onnxruntime`, `numpy` and `cv2` (OpenCV). Install and
pin a mutually compatible set in the project virtual environment before enabling
real-model checks. The adapter uses CPUExecutionProvider. Exact package versions,
GPU providers, throughput and Python 3.14 compatibility are not verified here.
Do not install multiple OpenCV wheels into the same environment.

The existing `worker/requirements-dev.txt` installs baseline subtitle/test tools;
it intentionally does not claim to install this unverified optional model stack.
Review official APIs before locking the vision environment:

- https://github.com/RapidAI/RapidOCR
- https://onnxruntime.ai/docs/
- https://huggingface.co/Carve/LaMa-ONNX

## Explicit local manifest

In **Settings → AI & processing**, choose an existing JSON manifest using the
native picker. Editor's Local vision section exposes the same configuration
transaction. The worker validates schema and every configured artifact's SHA-256,
resolves relative paths against the chosen manifest directory and writes canonical
paths to `integration-workspace/local-models.json` in Electron user data. It does
not copy weights, install dependencies, download files or run inference. Moving
weights later requires choosing an updated manifest.

Configuration runs through the existing worker queue and supports cancellation.
Until commit, the previous setup remains active; failed schema/hash checks or
cancellation preserve its bytes. Selecting a JSON file alone is not success. The
manifest must contain at least one valid OCR language or inpainting configuration.

Startup precedence is:

1. Explicit `REUPMATIC_MODEL_MANIFEST` environment override.
2. Previously saved workspace `local-models.json`.
3. Developer fallback `models/local.json` at the repository root.

An environment override prevents the picker from silently replacing that setup;
remove the override deliberately and restart to use the saved workspace choice.
Relative paths in a hand-authored manifest resolve against its own directory.
Navigation and refresh only inspect status; they never install or download
packages/weights. `models/local.json` and model files are not part of this ZIP.

The following is a template, **not a usable preconfigured model**. Replace paths
and every `REPLACE_WITH_SHA256` with the SHA-256 of the actual local artifact.
Relative paths resolve against the manifest directory. Do not use URLs or network
shares. Keep the exact recognizer, dictionary, OCR version and input height paired.

```json
{
  "version": 1,
  "ocr": {
    "en": {
      "det": {"path": "en/det.onnx", "sha256": "REPLACE_WITH_SHA256"},
      "rec": {"path": "en/rec.onnx", "sha256": "REPLACE_WITH_SHA256"},
      "keys": {"path": "en/keys.txt", "sha256": "REPLACE_WITH_SHA256"},
      "det_version": "PP-OCRv4",
      "rec_version": "PP-OCRv4",
      "rec_height": 48
    }
  },
  "inpainting": {
    "model": {"path": "lama_fp32.onnx", "sha256": "REPLACE_WITH_SHA256"}
  }
}
```

Configure only languages actually supported by the chosen recognizer/dictionary.
`vi` requires a verified Vietnamese-capable Latin recognizer; the application does
not substitute Chinese weights for Vietnamese. The supported manifest version
labels are v3/v4/v5, not proof that all exports under those names are compatible.

The LaMa adapter accepts float32 `image` [1,3,512,512] and `mask` [1,1,512,512],
with output RGB in the export's 0–255 range. A model with another shape/range is
rejected, not silently coerced into a different contract. Code licensing, original
weights and converted artifact licensing/provenance must each be reviewed.

## Run and interpret results

Open an authorized local video in Editor. Choose the sample start/end, then use
Local vision to refresh setup status, choose content language and run OCR or
removal explicitly. OCR is limited to 120 seconds. Inpainting is limited to a
10-second, 24 fps proxy with the longest side at most 960 pixels.

Available status means required files and runtime packages were found at inspection.
It does not rehash all files on navigation and keeps `verified: false`. Successful
configuration means the selected artifact bytes passed checksums at that moment;
it is not inference, accuracy or license approval. Actual runs recheck hashes,
and changed weights fail closed. Adapter doubles are test-only. Raw OCR evidence stays separate
from editable cues. Applying a draft is explicit, revision-checked and undoable.

Automatic removal identifies text per frame without a mandatory region-review
step. It is not a non-text watermark detector or a temporally consistent video
model. Original-file preservation is enforced. Mask pixel preservation applies
before lossy video encoding, not to every final MP4 pixel.

Python audit hooks deny Python-level networking/child execution in the inference
runner. They are not a hostile-native-code sandbox: use trusted local artifacts.


## Saved processing recipes (0.8)

Editor sample/full, batch and developer folder intake can use these same local
models through [local-processing.md](local-processing.md). Jobs admitted from
batch/folders save required model fingerprints; replacing configuration does not
rewrite them. Restore the matching setup to retry an existing job, or admit a new
job for changed models. Configuration/status is not evidence of real inference.
