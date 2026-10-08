# Ava-Valt importer — deployment instructions (8 October 2026)

This ZIP contains a complete updated website project with the existing quarantine,
Needs Review, automatic review worker and Discord notification files. It does not
contain the live GitHub avatar database or any login credentials.

## Update safely

1. Download/keep a backup of your current importer repository before replacing files.
2. Extract the ZIP. Copy the files and folders **into the root** of your existing
   importer repository (not a folder named `ava_work` or the ZIP filename).
3. Keep your existing Vercel secret environment variables and GitHub database
   files. Do not commit `.env.local`, cookies, API tokens or passwords.
4. Commit the changes on GitHub and redeploy the linked Vercel project.
5. Open Auto Import Settings > Providers and ensure KitsuneDB is ticked.
6. Return to the main IMPORT page. Under **IMPORT providers**, click
   **KITSUNEDB ONLY**. Select Search, enter `dog`, then press RUN.
7. If KitsuneDB returns results, check a few avatar IDs and their platform
   labels before ADD SELECTED TO GITHUB.
8. If results show 403/429 or timeouts, do **not** bypass provider restrictions.
   Check logs and obtain approval/support from the provider if necessary.
9. For unknown platform records, continue using Quarantine Repair then
   Platform Needs Review; confirm each platform before VERIFY & ADD.

## What changed

- Main IMPORT page has working selectable providers, including KitsuneDB only.
- Manual searching only queries enabled, selected providers.
- Per-provider health messages remain visible after a search.
- Improved empty/negative platform metadata handling.
- Duplicate avatars can inherit valid platform evidence from another provider.
- Persisted strictPlatformMode toggle now saves as intended.
- Provider responses with a malformed avatar entry no longer break normal search.
- Added mock-network regression tests: `npm run test`.

## Why Unity and Vercel can differ

Vercel makes requests from a cloud server, not from the same public IP and
network context as the Unity desktop importer. Providers may impose different
access rules or return different data to a cloud request. The website badge
may also contain platform data absent from KitsuneDB's public VRCX JSON.
The code cannot guarantee provider data or access when the external service
restricts it. Keep those cases in manual review.

## Validation

Automated mock-network tests and static JS/JSX parser checks passed in the
authoring environment. The Next.js production build was **not verified** there
because installation of its dependencies timed out. After redeploying, check
the Vercel deployment log for any build errors and test the importer UI.
