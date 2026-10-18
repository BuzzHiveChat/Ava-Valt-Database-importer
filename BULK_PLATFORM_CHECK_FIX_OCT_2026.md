> **SUPERSEDED / SAFETY WARNING:** This describes the earlier unthrottled version. Do **not** deploy that earlier ZIP. Use the newer SAFE_API_TRAFFIC_SETUP.md for the opt-in, site-wide rate-limited platform checker.

# Ava-Valt — Bulk Platform Check Update (18 October 2026)

This update fixes **CHECK SELECTED PLATFORMS** stopping after ten avatars.

## How it works

1. Search for avatars as usual, then tick the avatars you want to check. Alternatively, click **SELECT ALL UNKNOWN (number)** to select every avatar in the current loaded search results that has no confirmed platforms, even across multiple search-result pages.
2. Click **CHECK SELECTED PLATFORMS (number)**. The website checks **all selected unknown-platform avatars**, not just the first ten.
3. The browser sends requests in **sequential groups of at most ten**. The server keeps its ten-avatar-per-request safety cap to avoid an overloaded / timed-out request.
4. Watch the progress bar and status for processed, attempted, resolved, unresolved, and deferred counts. **STOP CHECKING** finishes the current request and stops before the next batch.
5. Keep the page open until checking finishes. The check only updates the displayed search results; it **does not write to your live GitHub database**. Use **ADD SELECTED TO GITHUB** separately to add avatars after reviewing.

## Limits and what is not guaranteed

- A platform is marked PC, Android/Quest, or iOS **only when an external source actually confirms it**.
- Slow/unavailable sources can leave platforms **unknown** or **deferred**. Processed is not the same as positively verified; the status lists attempted and resolved counts separately.
- A failed batch pauses further requests instead of repeatedly contacting a failing API. Earlier successful batches remain visible in the page. You can try again later, but unavailable providers may still fail.
- The website must remain open for large checks. Very large selections can take several minutes; the button does not create a server-side background job.
- No Unity changes, GitHub token changes, or database resets are needed.

## Deploy

Replace the corresponding files in your website GitHub repository with this ZIP's contents and redeploy as usual. Be sure the **new** `lib/manualPlatformChecks.mjs` and the modified `app/page.js` and `app/style.css` are all included.

`npm test` runs the existing project tests plus eight new bulk verification tests. Tests do not contact the real avatar providers or write to GitHub.
