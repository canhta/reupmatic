# Local Batch & Saved Jobs — Integration 0.4

> Date: 2026-09-15. English documentation; English/Vietnamese UI.
> Implements a bounded part of SC-07, ED-P04, NAV-03 and INT-05/07.
> This is manual local batch, not Plus Automation, a final entitlement decision, or the entire media pipeline.

## 1. Implemented source flow

Open **Batch & jobs** in the Editor area → select local videos → optionally attach an individual SRT to each video → choose output folder → **Add to queue** → **Start queue**.

The drawer is available without opening a single-video project. No profile, account, Douyin source, OCR or model is required. Each job currently performs a full MP4 render using the existing review preset and optional registered SRT. It does not silently copy the current Editor's cue text to every video. Other approved transforms/AI/profile fields remain integration work, not removed scope.

Draft selections are in memory until added; they participate in the unsaved-work quit warning. Enqueue snapshots each file path/hash, its own subtitle path/hash, encoding and chosen folder into SQLite. The host obtains all paths from native pickers; renderer IPC accepts opaque IDs only. A request identifier is retained while retrying an unacknowledged enqueue. Identical resubmission returns existing jobs; changed data under the same identifier is rejected.

## 2. Jobs and controls

| Action/state | Bounded behavior |
|---|---|
| New launch | Queue is paused. Saved pending/finished jobs are visible; no work starts because the drawer opens or UI locale changes. |
| Start | Dispatch waiting jobs one at a time through the existing RenderCoordinator/Python worker. A running Editor render is allowed to finish before the next batch dispatch. This is not measured resource scheduling. |
| Pause | Stop admission of the next batch item. Current work may finish. |
| Cancel | Cancel the selected waiting/active item. An active request becomes Cancelling until its actual result is known. Closing the drawer is not cancellation. |
| Retry | Failed, cancelled or interrupted item returns to queued, keeping its job ID/input/destination. Increment attempt only at dispatch. If paused, Start is still required. |
| Input failure | Record the error on that video and continue independent waiting videos. Re-register sources and verify expected hashes before rendering. |
| Runtime failure | Pause dispatch instead of marking every remaining input bad. Already queued work remains saved. Runtime restart UI is pending; reopen the app to recreate its worker. |
| Quit/reopen | Save the queue. Running work becomes Interrupted when shutdown interrupts it; explicit cancellations are retained. Crash recovery marks previously Running as Interrupted and Cancelling as Cancelled. Retry is explicit. |
| Complete | A concrete output was committed. Retry cannot create another completed job. Show in folder is available; if moved/deleted, report the missing output without rewriting history. |

The stable UI states are `queued`, `running`, `cancelling`, `interrupted`, `complete`, `failed`, `cancelled`. Progress is stage-only unless an actual numeric fraction is supplied. A concrete committed output can win a late cancellation race: do not label an already-created file as if no output exists.

## 3. File and process boundaries

One app instance owns the local SQLite journal. Basic `node:sqlite` operations are used so this slice adds no npm/native-addon install. Availability in the packaged Electron runtime is a mandatory later check; initialization failure disables batch only and must not reset/delete the database or block the individual Editor. Synchronous, bounded metadata operations currently run in the host; the intended utility-process relocation and load measurement remain INT-07 work.

Output names use the original stem and stable job ID. Render into the existing private cache, then copy to a temporary file in the chosen folder, verify its hash and exclusively link it to the final name. Do not overwrite an existing file, symlink or hardlink. On retry, an existing matching final file is reconciled rather than creating another copy. A mismatching final file is an explicit conflict. Filesystems without the current adapter's hardlink support return `OUTPUT_COMMIT_UNSUPPORTED`; a portable fallback is not silently claimed. Abrupt termination may leave a `.reupmatic-*.partial` file; automatic orphan cleanup is pending, not permission to delete user files.

The journal stores snapshots/progress outcomes, not video bytes or credentials. Worker asset IDs are session-scoped; jobs re-register original paths after restart. Restart does not create a second Python workflow engine. Verified render cache can be reused, but a partial FFmpeg encode is not resumed frame-by-frame. No power-loss/all-filesystem durability guarantee is claimed.

Integration safety bounds: up to 100 selected items per admission, 2,000 saved jobs, one active batch item. These are temporary resource bounds, not a monetization/paywall decision. Queue history cleanup/retention, folder triggers, workflow scheduling, retry backoff, cloud and Plus policy are not implemented here.

## 4. Acceptance and evidence

| ID | Check | Evidence lane |
|---|---|---|
| BJ-AC01 | Native multi-select, per-video SRT and chosen folder; no profile or current-cue copying. | Electron source; owner runtime check pending. |
| BJ-AC02 | Replay enqueue safely; reject a reused ID with different configuration. | Real SQLite core test. |
| BJ-AC03 | Pause/cancel/retry preserves identity and does not stop unrelated items. | Controlled-runner plus SQLite/file tests. |
| BJ-AC04 | Restart preserves completed/queued work and separates interrupted from explicit cancellation. | SQLite close/reopen tests; OS-crash test still pending. |
| BJ-AC05 | Source change, conflicting output or lost folder never silently overwrites data. | Core filesystem/native tests; target filesystems pending. |
| BJ-AC06 | Shared worker exports a good item after a bad item; resulting video exists in the chosen folder. | Actual Python/FFmpeg local integration. |
| BJ-AC07 | EN/VI controls and persisted result appear after a full Electron restart. | `tests/e2e/batch.e2e.mjs`, source-only. |

See [results](../research/integration-0.4/RESULTS.md) for what actually ran. No new billing, background execution or automatic publishing policy has been confirmed by this implementation.
