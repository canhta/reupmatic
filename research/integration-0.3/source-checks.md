# Upstream checks — 2026-09-15

This pass did not re-audit every dependency. Existing pins were retained; successful dependency resolution is still required.

| Source | Observation / use |
|---|---|
| https://github.com/microsoft/playwright/releases | 1.63.0 marked latest stable; selected only as the proposed Electron test dependency. No installed compatibility evidence. |
| https://playwright.dev/docs/api/class-electron | Experimental Electron automation API, launch and main-process evaluation; basis for the source-only test harness. |
| https://playwright.dev/docs/api/class-electronapplication | ElectronApplication firstWindow/evaluate/close interfaces. Actual test remains blocked. |
| https://biomejs.dev/recipes/git-hooks/ | Biome check-only commands for Lefthook; existing approach retained. |
| https://biomejs.dev/guides/manual-installation/ | Standalone binary path for 2.5.13 inspected; retrieval did not succeed. |
| https://lefthook.dev/ | Installation/configuration guidance; 2.1.14 shown in current project site. No binary execution here. |
| https://releases.electronjs.org/ | 44.3.0 shown as current stable line; existing pin retained, not installed. |
| https://www.npmjs.com/package/typescript | 7.0.2 reported by package metadata; retained. Local checks use preinstalled 5.8.3 only. |

Network/registry failures are evidence of this execution environment, not evidence that those versions or packages are unavailable globally. No package artifact, weight or font was redistributed.
