# Ava-Valt website importer — avatar source update (18 October 2026)

## What was changed

- Removed the two unwanted external search providers from all active import, automatic import, metadata repair, manual review, and quarantine flows. Retired API helper modules and their test route were removed.
- Persisted GitHub settings from older deployments are filtered when read/written, so removed sources no longer appear in toggle menus or run-health summaries and cannot be enabled again through stale settings.
- Added AviSeek (enabled by default), based on its **documented keyless public catalog**:
  - `GET https://aviseek.vrchatlegends.com/api/world/search?q=fox&limit=120` for search.
  - `GET https://aviseek.vrchatlegends.com/api/world/avatars?ids=avtr_...` for exact avatar-ID platform lookup. This avoids fuzzy matches and an unrelated page-view counter.
  - Normalizes `pc`, `quest`, `ios` to `PC`, `Android`, `iOS`; never claims a missing build exists.
  - Uses a 60-second server cache, honors 401/403/429 and per-source availability.
- Added AviSeek, VRCNDb and NekoSuneVR website links to the manual importer. VRCNDb supports visible platform filters but has **not** been added as an unverified automatic API.
- Added a platform filter to imported search results: All, PC, Quest/Android and iOS.
- Added AviSeek exact-ID lookup to Needs Review and Quarantine interfaces. Existing privacy/opt-out controls, GitHub database saving, strict platform quarantine, and Discord integration are preserved.

## Updating your website

1. Back up the currently deployed importer repository and any separate avatar database.
2. Copy the contents of this folder into the **root** of the existing website repository, replacing old files.
3. **Delete obsolete paths in that repository.** Copying files alone does not delete old code. Remove the former third-party provider test route, retired lookup helpers, and its old test and documentation if they still exist. The supplied ZIP itself does not contain them.
4. Commit and deploy through Vercel as before. Do not overwrite your Vercel environment variables or GitHub database files.
5. Open **Auto Import Settings → Providers** and confirm AviSeek is enabled.
6. Go to **IMPORT providers**, click **AVISEEK ONLY**, run a sample search, and check the PC/Quest/iOS labels before adding avatars.
7. Retired providers will disappear from stored settings when settings are next saved. Historical avatar records are **preserved**, not removed from your GitHub database.

## Validation

- `npm test`: **25 tests passed**, using mocked provider and GitHub responses.
- TypeScript's JSX/JavaScript parser: **66 files checked; 0 syntax errors**.
- Live external network tests and `npm run build` were **not completed** in this offline project container (Next.js packages were not installed). Confirm the build and a live test search after deploying.

### Documentation

AviSeek public API: https://aviseek.vrchatlegends.com/docs/reference

VRCNDb manual browsing: https://db.vrcnext.com/

Credit: Avatar catalog data sourced from **AviSeek / VRChat Legends**, subject to its terms and rate limits.
