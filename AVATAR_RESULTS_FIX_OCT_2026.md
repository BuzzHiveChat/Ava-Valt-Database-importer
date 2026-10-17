# Ava-Valt — Search Results & Platform Card Fix (18 October 2026)

This update is based on the supplied website screenshots and status line.

## Fixed

- The old manual-search default was **120 total cards**, even when VRCWB/NSVR returned more (e.g. 886 and 516). Counts for each provider refer to the **raw matches returned by that provider**, not unique displayed results. The search now offers 120, 500 (default), and 1000 result caps, with 36 cards per UI page and Previous/Next buttons.
- It interleaves providers while combining matching avatar IDs instead of letting one provider occupy all of the first 120 cards. The UI now shows each avatar's **Found in** source(s).
- The platform badges PC / Android / iOS were touching because the CSS styles lived in `app/globals.css` but `app/layout.js` imports only `app/style.css`. Badges and avatars are now styled in the actually loaded stylesheet, with a safe layout for long names and avatar IDs.
- AviSeek now uses the documented catalog `/api/world/list` for **Latest**, `/api/world/random` for **Random**, `/api/world/search` for typed queries, and `/api/world/avatars?ids=` for exact avatar ID searches. If more than 500 are requested, search/list uses the documented `nextOffset` cursor to obtain a second page.
- Selecting **Quest / Android** or **iOS** sends a matching platform query to AviSeek. Changing the platform needs a new RUN SEARCH; the page also filters loaded cards locally.
- Cards with unknown platform metadata are still clearly marked **Platforms unknown**. An optional **CHECK SELECTED PLATFORMS** button checks up to 10 selected unknown-platform avatars via the existing exact-ID verification workflow. It does not write to GitHub. Only confirmed platforms are set.
- Provider outages and invalid API JSON are surfaced as warnings rather than silently deleting results from healthy providers. HTML returned by an API is now identified separately from malformed JSON.

## How to deploy

1. Back up your site repository on GitHub.
2. Copy the **contents of this complete folder** into the matching source directory of your importer website repository, keeping all existing files not included in the ZIP as needed. This update adds `app/api/import/verify/route.js`.
3. Deploy the Next.js website through Vercel or your usual hosting workflow. No changes to Unity or to the existing GitHub avatar database JSON are required.
4. Reload the admin page. Start with **AviSeek + PAW + VRCWB + NSVR**, try **Search** mode with a term, and choose **Up to 500**. Use `Found in` and the **All sources** dropdown to see contributions. For iOS, choose iOS and run the search again.
5. If a source consistently returns `network: fetch failed`, HTML, or invalid JSON, switch off **that provider** in Auto Import Settings and try it again after the remote service recovers. Other providers still work.

## What the change cannot guarantee

- **AvtrZip: unavailable (network: fetch failed)** means the deployment could not contact that external API. DNS/network restrictions, a temporary outage, or service blocking cannot be fixed with CSS or client code.
- **CuteDB: unavailable (invalid JSON)** means that provider did not return a valid JSON API response. We do not treat HTML or broken data as avatar results.
- **PAW: 120 / AviSeek: 120** previously meant the endpoints returned 120 entries to that search, *not* that all 120 were unique or had verified platform metadata. A PAW avatar may have no reported platform, and additional public sources may also lack that avatar. No platform is guessed.
- The results count is unique **among the batches fetched this time**, not the total size of every third-party catalog. The exact number depends on which providers are available, selected, and return matches for the query.
- This patch was checked with unit/integration tests and syntax parsing. The third-party APIs and production Vercel deployment were not fully live-tested from this environment.

Run `npm test` from the extracted project root. Tests do not modify the live GitHub database.
