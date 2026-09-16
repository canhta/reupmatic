# Reupmatic — Dependency and Tooling Update Audit

> Checked: 2026-09-15 · Integration 0.2 · R-18. **Source-verified targets, not installed package/lockfile verification.** The container cannot resolve the npm registry. Exact source observations do not prove peer compatibility or the content of a published tarball.

## Selection

Use stable release channels, pin selected versions, and update via reviewed PRs. Do not use a moving `latest` string in release manifests or mistake a repository's beta `main` for its latest stable release. Node 24 LTS is the selected development line, not a claim that it is Node's newest Current major. Python 3.14 is a target to test; the local checks ran on 3.13.5.

| Dependency | Manifest target | Primary evidence / qualification |
|---|---|---|
| Electron | 44.3.0 | [Electron releases](https://releases.electronjs.org/), stable branch target. Installer, Chromium codecs and native modules untested. |
| React / React DOM | 19.3.0 | [React versions](https://react.dev/versions), [19.3 announcement](https://react.dev/blog/2026/09/09/react-19-3). Same version for both. |
| TypeScript | 7.0.2 | [Releases](https://github.com/microsoft/TypeScript/releases), [7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/). Use `tsc`; the earlier compiler-API syntax helper was removed from active tooling because TS7 changes that API availability. Local checks still used 5.8.3. |
| Vite / React plugin | 8.3.0 / 6.1.1 | [Vite releases](https://github.com/vitejs/vite/releases), [plugin releases](https://github.com/vitejs/vite-plugin-react/releases). Resolve together before claiming compatibility. |
| Biome | 2.5.13 | [Release](https://github.com/biomejs/biome/releases/tag/%40biomejs%2Fbiome%402.5.13), [Lefthook integration recipe](https://biomejs.dev/recipes/git-hooks/). Configure formatter/linter/import assists; no executable test here. |
| Lefthook | 2.1.14 | [Releases](https://github.com/evilmartians/lefthook/releases). Check-only staged paths, explicit fixes, pre-push fast checks. No duplicate hook manager. |
| WaveSurfer | 7.12.12 | [Stable releases](https://github.com/katspaugh/wavesurfer.js/releases). Do not take 8.0.0-beta.5 merely because main references it. |
| Timeline | 1.0.0 | [Tagged source](https://github.com/xzdarcy/react-timeline-editor/releases/tag/v1.0.0). Root React peer declaration permits >=18, but published artifact/workspace references and transitive peers still need real npm installation. |
| JASSUB | 2.5.15 | [Inspected manifest](https://raw.githubusercontent.com/ThaUnknown/jassub/master/package.json). Source observation, not a verified live registry dist-tag. Check worker/WASM/font loading and composite licenses. |
| i18next / react-i18next | 26.4.2 / 17.0.14 | [i18next manifest](https://raw.githubusercontent.com/i18next/i18next/master/package.json), [React adapter manifest](https://raw.githubusercontent.com/i18next/react-i18next/master/package.json). Source observations; matching peers still need installation. |
| Less | 4.9.1 | [Releases](https://github.com/less/less.js/releases); stable, not the 5.x prerelease line. |
| pysubs2 | 1.9.0 | [PyPI](https://pypi.org/project/pysubs2/). Python >=3.12; not installed here. |
| Ruff / jsonschema | 0.16.7 / 4.26.0 | [Ruff releases](https://github.com/astral-sh/ruff/releases), [jsonschema PyPI](https://pypi.org/project/jsonschema/). Ruff unavailable; installed jsonschema used only for the recorded checks. |
| @types packages | Node ^24.0.0; React ^19.2.18; React DOM ^19.0.0 | Unresolved compatibility ranges. Do not label them exact newest pins. Resolve/pin actual packages with Node/React and commit the lock in INT-01. |

## Continuous maintenance, not automatic production changes

Use the existing [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference), not a first-party updater. Weekly npm/pip/Actions PRs; related minor/patch groups; separate major review; no automatic merge. Existing `npm outdated` supplies on-demand checks. Repository settings must enable the configuration after it is pushed; no GitHub account was accessed here.

CI actions are referenced by reviewed release tags: [checkout v7.0.1](https://github.com/actions/checkout/releases), [setup-node v7.0.0](https://github.com/actions/setup-node/releases), [setup-python v7.0.0](https://github.com/actions/setup-python/releases). No commit SHA is invented; pin verified SHAs under the repository's supply-chain policy before production. Workflows use read-only contents permission and no privileged pull_request_target trigger.

The real npm lock is absent. Source CI fails on that gap rather than creating different dependency trees on each runner. Neither metadata review nor a formatter configuration is evidence that the full source currently passes upgraded build/lint checks. Finish the networked bootstrap in [CONTRIBUTING.md](../CONTRIBUTING.md).

FFmpeg, model weights/voices and GPU packages are not blindly upgraded with JS tools. Retain capability/quality/license checks and actual artifacts. No app/runtime redesign or first-party Rust was introduced.
