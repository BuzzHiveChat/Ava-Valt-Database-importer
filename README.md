> **18 October 2026:** Fixes for 120-result cap, provider mixing, PAW/AviSeek platform previews, and cramped avatar cards. See [AVATAR_RESULTS_FIX_OCT_2026.md](AVATAR_RESULTS_FIX_OCT_2026.md).

# Ava-Valt Web Admin V2

## What changed
- Next.js patched to `^16.0.10`.
- Removed deprecated no-op middleware.
- Added current avtrDB V3 provider.
- Standardized VRCX-style provider requests to `?search=...&n=...`.
- Provider health now reports working / blocked / rate-limited / unavailable.
- Explicit blocks are skipped; this project does not evade bans, access controls, or rate limits.
- Added manual **RUN AUTO IMPORT NOW**.
- Added Vercel Cron auto-import route.
- Auto-import deduplicates first and makes one GitHub database commit per run.

## Vercel environment variables
Set `GITHUB_TOKEN`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `CRON_SECRET` as **Secret** values.
The GitHub token should be fine-grained and limited to the Ava-Valt-Database repository with Contents read/write.

Optional:
- `AUTO_IMPORT_MAX_ADD=300`
- `AUTO_IMPORT_TERMS=avatar,fox,cat,dog,furry,cute,robot,dragon`

## Automatic schedule
`vercel.json` defaults to `15 3 * * *` (03:15 UTC daily), which is compatible with Vercel Hobby's daily cron restriction.
If your Vercel plan supports more frequent Cron Jobs, you can change the schedule.

## Safety
Do not put secrets in source code. Do not commit `.env.local`.
Providers that explicitly block this service should remain disabled/skipped rather than bypassed.

## Discord bot notification integration

The website now calls the Ava-Valt v2.12.0 bot after successful manual or automatic imports. See [WEBSITE_DISCORD_INTEGRATION.md](WEBSITE_DISCORD_INTEGRATION.md) for the deployment steps, WispByte HTTPS requirement, Vercel environment variables, fallback behavior, and testing.

## Automatic Platform Needs Review (5/hour, non-VRChat)

See [PLATFORM_AUTO_REVIEW.md](PLATFORM_AUTO_REVIEW.md). This opt-in worker
collects low-rate third-party metadata suggestions for owner review; it never
scrapes VRChat or publishes avatar platform changes without confirmation.

## Avatar sites and supported platforms

The retired search services have been removed from all active provider lists,
API routes, platform-repair lookups, and stored settings. An earlier saved
`auto-import-settings.json` is filtered at read/write time; the removed
providers cannot be re-enabled by stale settings. Existing GitHub avatar records
are **not** deleted or rewritten merely because they originally came from an
older provider.

**AviSeek** is a new enabled-by-default import provider using its official,
keyless catalog API: `GET /api/world/search?q=fox&limit=120`.
Exact-ID lookups use the documented `GET /api/world/avatars?ids=avtr_...` route,
which does not count a page view. The adapter handles `avatars` JSON records, reports provider errors, caches
successful searches for at least 60 seconds, and maps explicit `PC`, `Quest`
(`Android`) and `iOS` metadata without inferring missing builds. The importer
credits [AviSeek / VRChat Legends](https://aviseek.vrchatlegends.com/).
Its public API rules: https://aviseek.vrchatlegends.com/docs/.

**VRCNDb** (https://db.vrcnext.com/) supports visible PC / Quest / iOS
filters; it is linked from the importer and Needs Review page for manual
checking. Its API format was not verified, so it has *not* been wired to
unverified automatic URLs. **NekoSuneVR** remains available for search and
exact-ID checks. There are no changes to the GitHub write-back workflow.

To test a single source, choose **AVISEEK ONLY** in the import panel. On the
Needs Review page, choose **LOOK UP AVISEEK** for a single exact `avtr_` ID
before manually confirming the suggested platforms.

## Website versus Unity
The Unity client and a serverless Vercel function do not share an IP address,
network environment, authentication context or request headers. A provider may
allow Unity/VRCX desktop traffic while restricting server/cloud traffic. An
HTTP 400, 401, 403 or 429 cannot be solved by changing platform mapping or
adding an extra query parameter indiscriminately; follow the provider docs
and respect their rate limits/terms. This release improves local JSON parsing
and exposes per-provider results, but does not guarantee third-party access.

## Verification
Run `npm run test` for isolated mocked-network tests, and `npm run build`
with Node 20.9+ and installed dependencies to verify the Next.js compilation.
No live provider or GitHub writes are made by the test suite.

## Bulk import from Platform Needs Review

After manually checking platform compatibility, tick the supported PC,
Android and/or iOS boxes for the avatars you want to publish, then click
**IMPORT ALL TICKED (N)**. Selections persist while changing pages/searches
in the same browser session. The owner-only endpoint checks creator opt-outs,
validates each avatar against the active review queue and updates the live
GitHub database in groups of up to 50. Successful records are removed from
review; rejected ones remain. See `DEPLOY_THIS_UPDATE.md`.
