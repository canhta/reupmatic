# Current editing boundary

`recipe.schema.json` defines the data-only editing value embedded under
`processing.editing`. `processing.schema.json` is authoritative for the complete
recipe. Project, batch, folder and worker schemas embed the same shape for offline
validation; contract tests reject drift. Runtime additionally checks rectangle
sums, source duration, interval intersection and output resource bounds.

Core: `app/core/editing/edit-recipe.ts`; native mirror:
`worker/media/editing/recipe.py`. UI passes data, never FFmpeg syntax. Empty editing
objects, unknown fields, unsupported versions and non-finite values are errors.
An editing-only recipe has an empty model fingerprint map.

Project v2 remains the sole current project format. Recovery uses its own current
SQLite schema1 and immutable source identity; no legacy reader/migration is added.
For exact clocks, filter order and export semantics see the editing and recovery contracts.


0.12 adds `composition.schema.json`: independent source ranges/speeds on an ordered
hard-cut clock, fixed even canvas and 30 fps. It belongs to an individual Editor
project, not a reusable processing profile or a multi-item batch submission.
