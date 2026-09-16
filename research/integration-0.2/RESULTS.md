# Reupmatic integration 0.2 — Executed Checks and Limits

> Date: 2026-09-15. This records bounded local execution, not an installer, full UI pass, or performance benchmark. See [environment](environment.json), [results](results.json), and [tool attempts](tool-attempts.json).

## Actual results

| Group | Result | Evidence |
|---|---|---|
| Core compilation | Passed with preinstalled TypeScript 5.8.3 and external Node declarations; not TypeScript 7.0.2 or a dependency lock. | [Compiler output](core-compile.txt) |
| Node checks | **22 passed:** prior cue editing/bridge checks; 4 render-correlation regressions; 3 HTTP range/file-response tests; 6 tooling/configuration checks. | [TAP output](node-tests.txt) |
| Python/native checks | **19 passed, 1 skipped:** worker/media and contract scenarios. `pysubs2` round-trip remains skipped because the real dependency is absent. | [unittest output](python-tests.txt) |
| Total | **41 passed, 1 skipped, 0 failed tests.** Failed environment/tool attempts are separately reported, not hidden in this total. | [Machine-readable results](results.json) |

The native sample/full test again compared 60 decoded frames from a two-second sample with the corresponding full lossless-render interval on a synthetic 320×180 fixture. It also checked audio, source immutability, cache invalidation/corruption, cancellation and item failure isolation. These are not browser-preview parity or throughput measurements.

The new HTTP adapter test streams a real temporary Unicode-named file through GET/HEAD/range responses and checks 206/416/missing file/cancellation behavior. It does not demonstrate that a particular Electron codec/player seeks correctly. The correlation tests simulate ordering of real state-machine events, not Electron IPC transport.

## Changes guarded by regressions

A render's public request ID now exists in the UI before IPC submission. The main process maps it to the worker request ID; results arriving before IPC acknowledgement are no longer discarded or returned to a queued state. A superseded or stale-revision result cannot replace the current preview. Actual Electron end-to-end behavior remains untested.

The media protocol uses registered file paths and explicit single-byte-range streaming instead of assuming that forwarding Range to `file://` implements seek semantics. HEAD, empty files, invalid/unsatisfiable ranges and If-Range are handled separately. This is an HTTP/file adapter, not a new video engine.

## Reproduction in this environment

```sh
# Bounded fallback only: compiler/types below were already present, not npm installed.
tsc -p tsconfig.core.json --typeRoots /opt/nvm/versions/node/v22.16.0/lib/node_modules/ts-node/node_modules/@types
node --test tests/core.test.mjs tests/render-tracker.test.mjs tests/media-response.test.mjs tests/tooling.test.mjs tests/bridge.test.mjs
python -m unittest discover -s tests -p 'test_*.py' -v
```

The absolute type-root path documents the test environment; it is not committed into project compiler configuration or a developer setup requirement. A prior probe used a nonexistent global type-root and failed TS2688; compilation succeeded with the actual installed declaration directory. No compatibility inference is made from this fallback to the pinned newer toolchain.

Additional static checks parsed project JSON/YAML/TOML, found no broken internal Markdown links, and parsed TS/TSX/CTS source with the preinstalled compiler. These checks do not validate Biome/Lefthook schemas or execute UI components. See [static results](static-checks.json) and [syntax output](source-syntax.txt).

## Blocked or not attempted successfully

Container registry DNS failed; a bounded npm lock-resolution attempt timed out without producing `package-lock.json`. `npm run check` and `npm run hooks:install` failed because Biome/Lefthook were not installed; Ruff was also unavailable. Configuration text and safe hook-install decisions were tested, **not the hook binaries or formatter output**. First formatting, lint remediation, actual dependency resolution and a locked full build remain INT-01/INT-09 work.

See [npm attempt](npm-lock-resolution.txt), [Biome attempt](biome-check.txt), [Lefthook attempt](lefthook-install.txt), and [Ruff attempt](ruff-check.txt). No generated lock, successful npm build, Electron UI screenshot, OCR/LaMa inference, macOS/Windows execution, signed package or remote CI run is claimed.

GitHub workflow and Dependabot files are supplied as configuration. They were not deployed to an account, and no continuing background update service was activated. The source CI deliberately requires a genuine committed npm lock before proceeding.

Historical evidence under `research/integration/` and `research/media-smoke/` is retained unchanged. No model weights, font files, native executables, node_modules, interpreter distribution or user media is bundled.
