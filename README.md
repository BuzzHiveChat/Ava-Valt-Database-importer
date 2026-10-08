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
