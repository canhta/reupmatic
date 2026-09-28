# web

Marketing site for the Reupmatic desktop app. The `web` pnpm workspace package of this
repository, deployed to Vercel as the `reupmatic` project.

**Production domain:** [reupmatic.canhta.com](https://reupmatic.canhta.com)

## Routes

- `/vi` — Vietnamese
- `/en` — English
- `/` — redirects from the browser language, Vietnamese by default

## Product truth

The site describes the current Alpha separately from work that is still in progress. Current
claims are grounded in the Reupmatic product repository:

- Douyin intake and downloads
- local video processing, subtitles, translation and voice
- shared batch jobs
- manually entered affiliate links and local post drafts

Direct social publishing and TikTok distribution are presented as upcoming work, not shipped
capabilities.

## Development

Run from the repository root; the lockfile and dependency set are shared.

```bash
pnpm install
pnpm --filter web dev
pnpm --filter web typecheck
pnpm --filter web build
```

Production variables:

```bash
NEXT_PUBLIC_SITE_URL=https://reupmatic.canhta.com
```

`NEXT_PUBLIC_MAC_DOWNLOAD_URL` and `NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL` are optional overrides.
Unset, the download buttons point at `/download/mac` and `/download/win`, which redirect to the
current asset of the `canhta/reupmatic` GitHub release.

The site is statically generated with Next.js and self-hosts Be Vietnam Pro.
