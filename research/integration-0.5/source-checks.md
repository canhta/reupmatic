# Sources and implementation assumptions — 2026-09-15

## Owner material (requested basis)

`Pasted markdown.md`: high-end-visual-design / Principal UI/UX Architect & Motion Choreographer. Full original retained in the local skill; hash in [source-provenance.json](source-provenance.json). Its sections include Absolute Zero, Creative Variance Engine, Double-Bezel, Island CTA, Spatial Rhythm, Motion Choreography, Performance Guardrails and Pre-output Checklist. They are preserved as a reference; desktop-specific departures/additions are explicitly mapped, not attributed to the source.

No claim that a font is installed/licensed, a $150k price comparison is valid, or a particular animation guarantees performance is made from that attachment.

## External implementation verification (separate from the owner reference)

| Primary source | Retrieved fact / use | Limit |
|---|---|---|
| `https://github.com/paulmillr/chokidar/releases/latest` → tag `5.0.0` | Latest release endpoint resolved to 5.0.0 during this pass. | Registry artifacts/lockfile not installed. |
| `https://raw.githubusercontent.com/paulmillr/chokidar/main/package.json` | Inspected version 5.0.0; ESM; Node >=20.19; MIT metadata. | Moving source manifest, not package checksum or license clearance of every dependency. |
| `https://github.com/paulmillr/chokidar` | add/change/unlink/ready/error events, depth, followSymlinks, awaitWriteFinish, async close; stability threshold depends on hardware/workload. | Documentation is not successful OS-event testing on the app's targets. |

The 2-second fingerprint check, 30-second reconciliation, per-rule content receipts, initial baseline, explicit paused restart and source-only dev gate are Reupmatic implementation choices. No new runtime/framework, library-installed test result, stable performance benchmark or commercial policy approval follows from this review.
