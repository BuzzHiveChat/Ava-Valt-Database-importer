# Automatic avatar privacy exclusions — Ava-Valt

## What changed

Avatar *descriptions* with explicit markers like `blacklist`, `blacklisted`, `unlist`, `private`, `do not import`, `do not list`, or `not public` now automatically create an **avatar-ID-only** entry in **Active avatar exclusions**. These avatars are held back from importing, and newly excluded IDs trigger a cleanup attempt against the live database, platform quarantine and review queue. Published GitHub Pages search files update with the existing search-index workflow; CDN/client caches may delay visibility.

If an older pending request already contains one of the supported avatar markers, opening **Avatar Opt-Outs & Creator Privacy** moves it to Active avatar exclusions automatically. There is also an **Auto-exclude existing pending avatar markers** maintenance button to retry the migration.

A `permanent_unlist` claim in a creator's bio continues to require Owner verification before any **creator-wide** exclusion. A provider's display name or avatar name cannot trigger a ban, and unknown or malformed avatar IDs cannot be auto-excluded.

## Transparency and reversibility

Automatic entries show **Auto-excluded (unverified provider description)** in the admin page, with the reporting source and reason saved in `avatar-opt-outs.json`. Third-party metadata can be inaccurate or spoofed, so automated avatar exclusions are NOT evidence of an authenticated creator request. Only the single reported avatar ID is blocked.

The Owner can revoke a mistaken automatic exclusion. Revoking it also suppresses automatic rediscovery for that ID, even if a later provider report uses another marker. Revocation does not automatically re-add deleted avatars to the live database.

## Install

Upload the contents of this ZIP over the previous Smart Search + API Safe version of the site, commit and redeploy in Vercel. Your GitHub `avatar-index.json` is not included or overwritten by this ZIP. **Do not delete `avatar-opt-outs.json` from the database repository.**

Open **Avatar Opt-Outs & Creator Privacy** after deploying to migrate older pending avatar markers. Click **Scan live database and auto-exclude markers** to find previously imported avatars with the new rules. If cleanup failed, click **Retry cleanup of excluded avatars**.

The other Smart Search and Redis safe-platform-checking configuration is unchanged.

## Caveats

- Detection uses avatar descriptions from the available sources, not authenticated VRChat access. It is reversible and operates per avatar ID only.
- The importer does not get new provider API requests from this feature.
- GitHub API writes and workflow updates are required for applying exclusions; Github authorization and permissions must be correctly configured.
- Automated tests use mock GitHub responses. Check results after production deployment.
