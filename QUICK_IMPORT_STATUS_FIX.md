# Quick Import status visibility fix

After confirming an import, look at the **GitHub save status** box above the review section. It now visibly shows Saving, Saved, No new records, or Error; includes HTTP/GitHub errors; and warns if a request times out after 75 seconds. It only calls a save successful after the server confirms the GitHub database contents.

The API requires a logged-in website session and `GITHUB_TOKEN` with write access to `BuzzHiveChat/Ava-Valt-Database`. A 401 means sign in again. A 403 commonly means token permissions. A 409 may indicate concurrent updates; server retries common SHA conflicts. The UI cannot guarantee a GitHub write when Vercel or GitHub is unavailable.

Deployment: replace the full importer app, push, let Vercel deploy, then test Quick Import. Look at the result box; if it reports an error, include that text and the relevant Vercel function logs when requesting a fix. Never share tokens.
