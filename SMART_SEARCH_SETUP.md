# Ava-Valt — Smart Avatar Search (October 2026)

This update improves the **SEARCH AVATARS** button, missing-platform display,
and rate-limit handling while retaining the existing GitHub import workflow.

## What you will see

- Search still queries the import providers enabled in Settings.
- Matching avatar IDs from different results share their existing confirmed
  PC / Android (Quest) / iOS platform data. No extra requests for this merge.
- **Show confirmed platforms only** is ON initially. This *does not delete*
  avatars without platform metadata. Untick it (or use SHOW UNCONFIRMED) to
  see every loaded result. Unknowns are clearly marked, not guessed.
- **Auto-check missing platforms** is ON initially, but outbound checks are
  *automatically blocked* until the owner has enabled shared Redis protection.
- When enabled, Run Search finds avatars first and then checks up to 50
  unknown IDs via AviSeek's documented batch endpoint, 10 IDs per request,
  with a minimum 30s delay between batches. Use STOP CHECKING to cancel.
- The regular **CHECK SELECTED PLATFORMS** button can be clicked when unknown
  IDs are selected. It displays setup guidance rather than silently doing
  nothing when Safe Mode is disabled.
- Unknown avatar platforms may remain unknown even after lookup. Providers
  cannot verify every avatar; marking every result PC/Quest/iOS would be
  misleading. The GitHub import still applies its existing review rules.

## API traffic protection

**Normal manual searches:**

- Search responses are cached for 75s; duplicate searches reuse the cache.
- Fresh searches have a 12s cooldown. Different searches initiated during the
  shared cooldown are rejected with a clear message, not extra provider calls.
- Providers returning 429 are paused for 5 minutes, blocked providers for 10
  minutes, and unavailable providers for 75s, to avoid repeated errors.
- With the Upstash REST Redis environment variables configured, the search
  cache, rate limiting and provider pauses are **shared across Vercel instances**.
- Without Redis, the search protections are in-memory per server instance,
  **not** site-wide. Heavy traffic can still fan out across Vercel instances;
  configure Redis before inviting many staff members or enabling heavy traffic.
- These controls cover **manual searching**, not scheduled or automatic
  importing. Keep automatic import disabled until it has separately reviewed
  traffic policies. Existing automatic import behavior was not changed here.

**Additional unknown-platform verification:**

This feature continues to fail closed unless both Redis and the explicit opt-in
flag are available. Use a Redis database compatible with Upstash REST and set
these environment variables in Vercel Project Settings:

```
UPSTASH_REDIS_REST_URL=https://YOUR-REDIS-ENDPOINT
UPSTASH_REDIS_REST_TOKEN=YOUR-SECRET-TOKEN
SAFE_PLATFORM_VERIFY_ENABLED=true
```

Keep the token server-side. Do **not** use a `NEXT_PUBLIC_` prefix.
Redeploy after updating the environment variables.

To enable only the shared search cache/cooldown and keep extra AviSeek lookups
OFF, configure the first two variables and omit the last one (or set it to
`false`). This is a reasonable lower-traffic starting point.

## Deploy to GitHub / Vercel

1. Make a backup or a Git commit of your current website project.
2. Extract the ZIP into your website repository, replacing matching files.
3. Deploy on Vercel (make sure Vercel is using this repository/directory).
4. Sign in as owner and run one small search, with the auto-import system OFF.
5. If you have enabled Redis checks, search with a few unknown avatars and
   watch the status/progress; then verify your Vercel logs.

No Unity project files or existing GitHub avatar database entries are changed
by deploying this frontend update.

## Verification

Run `npm test` (51 mock-based tests on this delivery).
We also ran a syntax parser over the modified page and server modules.
These do not replace a real Vercel deployment or a live provider check.

## Sources / further reading

AviSeek rate-limit, cache, and multi-ID API guidance:
https://aviseek.vrchatlegends.com/docs/
https://aviseek.vrchatlegends.com/docs/world-api
