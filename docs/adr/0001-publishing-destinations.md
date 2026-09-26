# 0001 — Publishing destinations share one seam

Status: accepted (owner, 2026-09-26). Facebook Page Reels is the first destination; YouTube and
TikTok follow on the same seam. Issues: #16 (YouTube, Facebook), #17 (TikTok), #18 (unattended runs).

## Decision

1. **One destination interface, one adapter per platform.** Policy (post lifecycle, capability
   checks, caption composition, reconcile rules) lives in `app/core/distribution/publishing/` and
   imports no Electron. Network adapters, OAuth windows and credential storage live in
   `app/electron/features/publishing/`. Authorization is host-only: the core `Destination` contract
   covers capabilities, preflight and the network phases, not the OAuth window.
2. **Secrets stay off the desktop.** Meta and TikTok require the app secret for every code or
   refresh exchange, so a stateless token broker in `web/` (Vercel route) performs only those
   exchanges. It stores nothing, logs no token, and accepts only the registered redirect URIs.
   Google's installed-app flow (loopback + PKCE) needs no confidential secret, so YouTube skips it.
3. **Credentials never cross IPC.** A host `ChannelCredentialStore` keeps tokens encrypted with
   Electron `safeStorage`, keyed by channel id. The renderer only sees `connection` and account
   display data.
4. **Native scheduling where the platform has it.** Facebook and YouTube hold the schedule, so a
   planned post goes out with the app closed. TikTok has no scheduling API; its planned posts need
   the app-driven runner of #18.
5. **Never publish twice.** Every attempt persists the platform reference *before* the call that
   can create a post. Publishing is serialised per post, and `canStartAttempt` is checked on the
   freshly read post before any remote call opens an upload session. Once the create-equivalent call
   is sent, only a definite refusal mapped to a named code is `failed`; 5xx, timeouts, unparseable
   bodies and unmapped codes become `unknown` and are reconciled by querying the platform — the
   create call is never retried automatically. A crash before submit reconciles to
   `PUBLISH_UPLOAD_INTERRUPTED` so the user can retry.
6. **Publication only on an explicit user action** on a concrete post — never from import, render,
   navigation, batch or folder automation.

## Platform facts (verified 2026-09-26)

| | Facebook Page Reels | YouTube | TikTok |
|---|---|---|---|
| API | Graph v25.0 `/{page_id}/video_reels` | Data API v3 `videos.insert` | Content Posting API v2 Direct Post |
| Auth | Login dialog → `https://www.facebook.com/connect/login_success.html`; code→token and short→long-lived user token need `client_secret` (server only); Page token from `/me/accounts` does not expire | Loopback `http://127.0.0.1:<port>` + PKCE S256; token endpoint `oauth2.googleapis.com/token`; refresh token | Login Kit desktop + PKCE; code exchange and refresh need `client_secret`; access 24 h, refresh 365 d |
| Scopes | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` | `youtube.upload` | `video.publish` (+ `user.info.basic`) |
| Upload | `upload_phase=start` → `video_id` + `upload_url`; `POST rupload.facebook.com/video-upload/v25.0/{video_id}` with `Authorization: OAuth`, `offset`, `file_size` (resumable by offset); `upload_phase=finish` | `POST /upload/youtube/v3/videos?uploadType=resumable` → session URI; PUT bytes, resumable | `POST /v2/post/publish/video/init/` (FILE_UPLOAD) → `publish_id` + `upload_url` (valid 1 h); PUT chunks with `Content-Range`, 5–64 MB chunks (last ≤128 MB), 1–1000 chunks, single chunk under 5 MB |
| Publish | `finish` with `video_state=PUBLISHED\|SCHEDULED`, `description`, `title` | Upload completion creates the video with `snippet` + `status` | Upload completion publishes; post_info sent at init |
| Schedule | `video_state=SCHEDULED` + `scheduled_publish_time`: > 10 min and ≤ 29 days ahead | `status.privacyStatus=private` + `status.publishAt`; only for never-published private videos; past time publishes at once | None |
| Status | `GET /{video_id}?fields=status` → uploading/processing/publishing phases, `publish_status` draft/published/scheduled/error | `videos.list?id=…&part=status,processingDetails` | `POST /v2/post/publish/status/fetch/` → `PROCESSING_UPLOAD`, `PUBLISH_COMPLETE`, `FAILED` (+`fail_reason`), `publicaly_available_post_id` |
| Media | 3–90 s, 9:16, ≥ 540×960, 24–60 fps, MP4 H.264/H.265, AAC 48 kHz stereo | ≤ 256 GB; Shorts need vertical/square ≤ 3 min | ≤ 10 min (and `max_video_post_duration_sec` per creator), ≤ 4 GB, 23–60 fps, 360–4096 px, MP4/MOV/WebM |
| Caption | `description` (hashtags ok) | `snippet.title` ≤ 100, `snippet.description` ≤ 5000 | `post_info.title` ≤ 2200 UTF-16 units |
| Limits | 30 API Reels / page / 24 h; errors 32, 80001 = throttled | `videos.insert` bucket: **100 calls/day per API project** (all users combined) | 6 init/min per token; daily post cap per user; active-user cap per client |
| Until reviewed | App in Development mode: only users with an app role; App Review + Business Verification to open up | Unverified project: every upload forced **private** | Unaudited client: every post forced `SELF_ONLY` |
| Mandatory UX | — | `selfDeclaredMadeForKids`; `containsSyntheticMedia` when applicable | Show creator nickname; user picks `privacy_level` from `creator_info` options with **no default**; comment/duet/stitch toggles honouring creator settings; commercial-content disclosure; `is_aigc` |

## Shape

```ts
// app/core/distribution/publishing — no Electron
type Platform = 'facebook_page' | 'youtube' | 'tiktok';
interface DestinationCapabilities {
  native_schedule: { min_lead_ms: number; max_lead_ms: number } | null;
  media: {
    min_ms: number;
    max_ms: number;
    min_width: number;
    min_height: number;
    max_bytes: number;
    aspect: { width: number; height: number; tolerance: number } | 'any';
  };
  caption: { title_max: number | null; body_max: number };
}
type PublicationPhase =
  | 'uploading'   // reference persisted, bytes in flight — resumable, nothing public yet
  | 'submitted'   // create/finish call sent; outcome pending or being processed
  | 'scheduled' | 'published'
  | 'failed'      // platform refused with a named code AND nothing was created
  | 'unknown';    // interrupted after the create call could have landed → reconcile only
interface Publication {
  attempt_id: string;
  phase: PublicationPhase;
  remote_ref: string;          // FB video_id | YT session URI then video id | TikTok publish_id
  remote_post_id: string | null;
  remote_url: string | null;
  scheduled_for: number | null;
  privacy: 'public' | 'private' | 'unlisted' | null;  // as granted, not as requested
  error: string | null;        // named code, e.g. PUBLISH_RATE_LIMITED, CHANNEL_REAUTHORIZE
  updated_at: number;
}

// Per-post platform choices. YouTube's made-for-kids declaration is required with no default; a
// YouTube post without one is refused rather than guessed.
interface YouTubeOptions {
  self_declared_made_for_kids: boolean;
  contains_synthetic_media: boolean;
}
interface PostOptions { youtube: YouTubeOptions | null }
```

`Post` gains `publication: Publication | null` and `options: PostOptions`; `state` stays
`draft | cancelled`. A new attempt is allowed only when `publication` is null or `failed`. `unknown`
and `submitted` resolve only through `reconcile`. The `published` view of the post list reads
`publication.phase`.

Host adapter per platform. Adapters return platform outcomes; the host applies the core transition
functions, so an adapter cannot skip the never-publish-twice policy:

```ts
type SubmitOutcome =
  | { kind: 'scheduled'; scheduled_for: number; remote_post_id: string | null; remote_url: string | null; privacy: 'public' | 'private' | 'unlisted' | null }
  | { kind: 'published'; remote_post_id: string | null; remote_url: string | null; privacy: 'public' | 'private' | 'unlisted' | null }
  | { kind: 'failed'; error: string }   // definite refusal: nothing was created
  | { kind: 'unknown'; error: string }; // ambiguous after finish → reconcile only

interface Destination {
  capabilities: DestinationCapabilities;
  preflight(post, media, now): NamedProblem[];             // before any network call
  begin(post, credentials): Promise<{ remote_ref }>;       // persisted before upload
  upload(remote_ref, file, onProgress, signal): Promise<void>;
  submit(remote_ref, post, plan): Promise<SubmitOutcome>;  // the one call that can create a post
  reconcile(remote_ref, post, credentials, now): Promise<SubmitOutcome | { kind: 'unknown'; error }>;
}
```

Authorization is a host flow (`app/electron/features/publishing/`): the OAuth window, the broker
exchange and the Page choice never cross IPC, and the renderer only receives account display data.

Caption composition is one core function: post body, then one line per affiliate link; the
platform title comes from `post.title`, clipped only where a platform limit forces it (preflight
reports a clip rather than silently truncating).

## Open policy (recorded as missing, not invented)

- Cancelling a post that is already `scheduled` on the platform: delete remotely, or only mark it?
- Editing caption or schedule after `scheduled`.
- Whether the app shows a warning while the platform app is still unreviewed (posts forced private /
  role-only).
- YouTube's 100 uploads/day is per API project for every user: a quota increase request is needed
  before public distribution.
- TikTok desktop redirect URI form (loopback vs registered https) — confirm in the TikTok developer
  portal before implementing #17.

## Owner prerequisites for Facebook

A Meta app (type Business) with Facebook Login; redirect URI
`https://www.facebook.com/connect/login_success.html`; the three permissions above; App ID in the
desktop build config; `META_APP_ID` and `META_APP_SECRET` as Vercel environment variables for the
broker. Development mode suffices for the owner's own Pages.

## Owner prerequisites for YouTube

A Google Cloud project with an OAuth client of type Desktop app; the
`https://www.googleapis.com/auth/youtube.upload` scope enabled and the YouTube Data API v3 enabled;
the client id baked into the build config as `REUPMATIC_GOOGLE_CLIENT_ID` (see
`scripts/generate-publishing-config.mjs`). The loopback redirect `http://127.0.0.1:<ephemeral port>`
is registered implicitly by Google for Desktop clients, so no redirect URI needs entering. No client
secret is used, so no broker is required. Until the project passes YouTube's audit, every upload is
forced private, which the outcome reports honestly.
