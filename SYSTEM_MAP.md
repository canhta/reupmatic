# System map — source 0.15.0

Generated from `docs/architecture/system-map.json`. Business scope and its linked specifications remain authoritative.

**Partial is a bounded source implementation. Planned means reserved paths only; `.gitkeep` is not executable code or acceptance evidence.**

## Five product areas

Sources · Editor · Channels & Affiliate · Automation · Settings.
Profiles and the shared queue are secondary surfaces, not extra product areas.

## Capability ownership

| Capability | Scope | State | Remaining work |
| --- | --- | --- | --- |
| Local media library | SC-02 | partial | Asset browsing and exact-content links include composition member project/export associations. Full transcript/analysis/derivation graph, duplicate-entry provenance propagation, retention and explicit file-deletion policy remain. |
| Authorized video intake | SC-01, SC-02 | planned | Authorized Douyin connector, durable download tasks, interruption recovery and import handoff; no restriction bypass. |
| Video and audio editing | SC-03 | partial | Bounded hard-cut composition, clip trim/speed/split/join/reorder, montage clock mapping and sample/full encoding are implemented alongside soundtrack/global edits. Transitions, layered tracks, per-clip effects/AI, native-rate/VFR mastery, multitrack/aligned voiceover integration and owner-run UI acceptance remain. |
| Project persistence and recovery | SC-02, SC-03 | partial | Current schema-5 snapshots, atomic undo and recovery retain independent text layers and translation provenance, clip sources, music and styles. Old formats are explicitly rejected without migration. Source-independent browsing, durable unapplied speech drafts, automatic dependency repair and owner crash/desktop acceptance remain. |
| Subtitle authoring | SC-05 | partial | Four independent timed text layers now retain language/provenance, copy invalidation and explicit replace/keep-edits review. Scoped rules, selected-layer timeline/export and composition clock maps exist. Reusable rule chains, multi-cue styling, advanced typography and installed visual/IME acceptance remain. |
| Recognition, translation and dubbing | SC-04, SC-05 | partial | Local CPU STT, translation and preset-voice synthesis use native hashed setup, correlated session drafts, explicit review and cancellation on the existing queue. Natural speech WAV/receipt preview and native export are implemented; alignment/mixing, durable speech stages in batch/Automation, real-model/language/license acceptance, installed UI and resource budgets remain. |
| OCR and text removal | SC-06, SC-13 | partial | Full-resolution inpainting, temporal quality, scene-text semantics, actual-model verification and analysis/classification consumers. Standalone whole-source OCR, retained chunk evidence and direct SRT export are implemented. |
| Shared processing recipes | SC-03, SC-04, SC-05, SC-06 | partial | Same coordinator/worker handles bounded Editor compositions with global edits, captions and soundtrack. Speech stages, composition AI, multi-clip batch/folder admission, richer stage artifacts and independent stage recovery remain; no second queue. |
| Reusable processing profiles | SC-03 | partial | Reusable global subtitle appearance, framing/color/speed/source-audio and OCR/removal settings exist. Clip-specific soundtrack, trim and per-cue overrides do not leak into profiles. Speech/rules/composition presets remain. |
| User-started queue | SC-07 | partial | AI stage expansion and complete artifact linkage through the existing durable queue. |
| Folder intake | SC-08 | partial | Product execution policy, permissions and scheduler integration; developer gating remains. |
| Saved workflows and runs | SC-08 | partial | Production triggers, schedules, missed-run recovery, flexible steps/endpoints and approved entitlement policy. |
| Shared manual labels | SC-09, SC-11 | partial | Identity-preserving catalog management; taxonomy merge/delete policy requires explicit decisions. |
| Content classification | SC-09, SC-13 | planned | OCR-based suggestions with evidence, manual correction and confidence; category match is not product identity. |
| Channels, affiliate and posts | SC-09, SC-10 | partial | OAuth, verified publisher capabilities, routing, uploads, schedules and platform reconciliation. Local drafts are not published posts. |
| Workspace catalog persistence | SC-02, SC-03, SC-09, SC-10, SC-11 | partial | Current-schema backup/restore; explicitly reject unsupported formats, without migrations. SQLite records are not a cloud sync layer. |
| Preferences and component setup | SC-11 | partial | Model downloads/updates, integrity, hardware budget, cache lifecycle and user-consented cleanup. |
| Accounts, Plus and credits | SC-11 | planned | Authentication, secure credentials and approved commercial execution policy. Do not invent prices, balances or access. |
| Future off-device execution | SC-12 | planned | Reserved extension only. Consent, storage, retention, placement, contracts and architecture remain open. |
| Bilingual application and accessibility | SC-14 | partial | EN/VI keyboard, IME, responsive and screen-reader checks on the actual installed application. |
| Trusted host and worker lifecycle | SC-03, SC-11 | partial | Dependency/OS integration, resource-aware execution and lifecycle policy verification. |
| Desktop distribution | SC-11 | planned | Source packaging exists; Windows/macOS installers, native dependency bundling, signing, upgrades and licenses remain. Empty folders are not installers. |

## Safe maintenance

Run `npm run structure:scaffold` to create only missing reserved markers. Existing files are never truncated.
Run `npm run structure:check`, `npm run scope:check` and `npm run test:structure` before packaging.
Retained source paths are protected by `docs/architecture/retained-paths.json`; intentional moves must have a recorded, real destination.
Update machine-readable maps deliberately and run `npm run scope:generate` to refresh this file and the coverage report.

The map preserves scope and ownership, not obsolete APIs. Greenfield development uses one current contract, without compatibility shims or migrations.
Do not remove a planned module because it is empty or report a disabled screen as an implementation. `.gitkeep` is not a backup.

## Detailed planning

[Feature and flow coverage](docs/planning/scope-coverage.md) records all SC-01–SC-14 slices and remaining gaps.
[Implementation sequence](docs/planning/implementation-sequence.md) orders remaining capabilities by dependency.
[Source ownership](docs/architecture/source-layout.md) describes runtime responsibilities.

The current delivered version is 0.15.0; the next minor archive is 0.16.0. Never overwrite an earlier archive.
