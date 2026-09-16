# Engineering skill adaptation

Owner source: https://www.skills.sh/mattpocock/skills
Reviewed 2026-09-15. This project applies selected workflows through
`.agents/skills/reupmatic-engineering/SKILL.md`; it is not a verbatim mirror or a
global installation of the entire upstream collection.

| Upstream skill | Applied here | Explicit adaptation |
| --- | --- | --- |
| TDD | Behavior tests at public worker/coordinator/packaging boundaries; failing and passing evidence; refactor after a working slice | The owner's instruction to continue authorizes these reversible engineering seams. No repeated approval request for each helper. |
| Codebase design | Cohesive business modules with small interfaces; local implementation decisions; avoid shallow forwarding wrappers | Runtime and protocol ownership stay consistent with the existing project rather than renaming every domain term to an upstream glossary. |
| Code review | Separate standards/readability and specification/completeness reviews against the supplied 0.5 ZIP | No Git commit, issue tracker or parallel sub-agent execution is invented. Archive provenance and actual test logs replace an unavailable commit diff. |

The existing local UI skill is retained with its original reference unchanged.
The owner's newer Astryx policy overrides visual recipes requiring a parallel
primitive system. Agent instructions remain only in root AGENTS.md. Do not copy
CLI-generated instruction files into nested feature folders.

## Primary references

- https://www.skills.sh/mattpocock/skills/tdd
- https://www.skills.sh/mattpocock/skills/codebase-design
- https://www.skills.sh/mattpocock/skills/code-review
- https://github.com/mattpocock/skills
