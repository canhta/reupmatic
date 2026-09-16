---
name: reupmatic-engineering
description: Implement and review Reupmatic modules using behavior-first tests, explicit runtime boundaries, small interfaces, readable files and the owner's root AGENTS.md rules.
---

# Reupmatic engineering workflow

Read root `AGENTS.md`, the relevant specification and existing tests first.
This is a project adaptation, not an unmodified upstream skill installation.
Source and adaptation notes: [engineering-skills.md](../../../docs/architecture/engineering-skills.md).

## Implement

Identify the business behavior and the smallest public interface that can express
it. Keep orchestration distinct from media/model execution. Verify a failing test
at that interface, implement one working slice, then refactor with tests passing.
Use existing worker/IPC seams; do not mock private methods merely to fit a test.

## Restructure

Find coupled responsibilities before moving files. Group by business ownership
inside runtime boundaries, keep related implementation local and avoid forwarding
layers whose interface exposes all their internals. Split oversized files by
responsibility, not arbitrary line ranges. Update the source map and imports.

## Review

Review standards and specification compliance as two separate passes against the
current BUSINESS_SCOPE.md, specifications and root AGENTS.md. The project is
greenfield: one current contract, no compatibility shims or migration pipelines. Check cancellation, stale results, user-edited data,
original-file protection, unavailable dependencies and EN/VI states. Record the
actual tests, remaining risks and setup-dependent gates in the versioned evidence.

No external issue tracker, global installation or parallel sub-agent execution is
assumed. The owner's instruction to continue authorizes reversible test seams and
refactors; do not stop to ask for approval of each function. Do not infer approval
of commercial rules, public actions, model licenses or a release from that autonomy.
