# Ava-Valt — API-friendly platform checking (October 2026)

This replaces the potentially high-traffic "check every selected avatar" feature.
**Off by default.** The site can be deployed with no changes; the bulk verify button
stays disabled, rather than accidentally generating traffic on community APIs.

## What changes

- Only the **owner** can run manual platform checks (server authorization enforced).
- **Up to 50 selected unknown/unchecked avatars per click** (remaining selections
  can be checked in a later session). Still up to 10 avatar IDs per HTTP request.
- Verifies using **one documented AviSeek multi-ID endpoint** per batch, rather
  than fanning out to PAW, NSVR, AviSeek and fallback databases for each avatar.
- **30 seconds minimum between outbound batches across your entire Vercel site**,
  using an atomic Redis lock (not an in-memory counter).
- **Shared Redis cache**: positive platform data for six hours, unknown data
  for 30 minutes. Repeated queries for cached IDs need no AviSeek network call.
- Honors provider `429` and `Retry-After`, and stores a shared cooldown.
- Stops on errors. If Redis is offline/unconfigured, no external lookup occurs.
- Unconfirmed platforms stay unknown; nothing is saved to GitHub by verification.

## How to enable when ready

1. Create a Redis database that supports **Upstash Redis REST**. You can use
   an Upstash-managed Redis database or a Vercel-integrated Upstash database.
2. In **Vercel Project → Settings → Environment Variables**, set **server-side**:

   - `UPSTASH_REDIS_REST_URL` — your Upstash REST endpoint (https://...)
   - `UPSTASH_REDIS_REST_TOKEN` — your Redis REST token (keep secret)
   - `SAFE_PLATFORM_VERIFY_ENABLED` — `true`

3. Redeploy. Only the owner will see the button enabled.
4. To turn off bulk verification again, set
   `SAFE_PLATFORM_VERIFY_ENABLED=false` and redeploy, or remove the variable.

**Do not** prefix the Redis token with `NEXT_PUBLIC_` or place it in any
client-side file. No extra npm dependency is needed.

## Important: other traffic

This safety gate covers the **manual "SAFE CHECK PLATFORMS" button only**.
The SEARCH button, AUTO IMPORT and scheduled importer may independently call
PAW, NSVR, CuteDB, AvtrZip and other providers. If you are concerned about
API blocks, **disable automatic imports** until you separately rate-limit those
paths and disable broken/unavailable providers in settings. Only signed-in
staff can access the search and verification APIs today, but staff can still
consume provider quotas. Consider adding a shared provider-level limiter for
search/automatic import as a follow-up before opening more endpoints to the public.

AviSeek documents the /api/world/avatars?ids=... endpoint and rate limits:
https://aviseek.vrchatlegends.com/docs/reference
https://aviseek.vrchatlegends.com/docs/

## Test

`npm test`

Tests use mock requests, not the live APIs. Always do a manual owner-only test
before enabling the feature for production use.
