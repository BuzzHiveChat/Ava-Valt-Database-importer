# Select all known avatars — Ava-Valt

**New button:** `SELECT ALL KNOWN (N)` in the avatar search result toolbar.

- Selects all loaded search results with reported PC, Android/Quest or iOS support (even when results span multiple pages).
- Keeps the `SELECT THIS PAGE`, `SELECT ALL UNKNOWN`, and `CLEAR SELECTION` buttons.
- Does not trigger any additional API calls, platform checks, imports, or GitHub writes.
- It adds to your selection. Click **CLEAR SELECTION** first if you want *only* known avatars.
- Respects the search limit: up to 120, 500, or 1000 loaded results, not every avatar in all external databases.
- Importing remains a separate owner action through **ADD SELECTED TO GITHUB**; existing opt-out and platform checks remain in place.

Replace the website project files with the contents of the ZIP and redeploy your Vercel site. Redis settings do not need to change for this button.
