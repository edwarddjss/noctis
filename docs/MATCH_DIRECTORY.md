# Match Directory REST API (TypeScript)

A dependency-free **Node.js 22+** REST API around the daily match directory documented in `REPORT.md` and `REPORT2.md` (October 18, 2026). It normalizes the source's Strapi-shaped JSON into games, league groups, reusable channels, player providers, and the **published player-page references**.

**Scope:** Metadata and link mapping only. This project does **not** fetch HLS playlists, mint tokens, proxy video, remove third-party ads, or guarantee that third-party players can be embedded or played. Confirm data-source terms and broadcast rights before shipping a public app. The data source is unofficial and may disappear or change without notice.

## Running in Noctis

Run `npm ci` and `npm run dev` from the repository root. The directory is served by Next.js at `/api/v1`; no separate server or deployment is required. Vercel uses the Node.js runtime. Optional environment variables are `DIRECTORY_URL` and `CORS_ORIGIN`. The directory cache is per warm function instance and is refreshed after 60 seconds. A cold instance returns 503 if the upstream is unavailable.

Run `npm test` and `npm run typecheck` to validate the integration. Tests use synthetic upstream data and do not require network access.

## REST reference

Base URL: `/api/v1` on the Noctis deployment.

| Method & path | Response |
|---|---|
| `GET /catalog` | **One-call snapshot**: all matches grouped by league; channel and provider indexes |
| `GET /matches` | Paginated match directory, including all published player options |
| `GET /matches/:id` | Single match (ID comes from the source feed) |
| `GET /matches/:id/options` | All player options for a match |
| `GET /matches/:id/options/:embedId` | One option within that match |
| `GET /leagues` | League + country groupings, match counts and unique `slug` |
| `GET /leagues/:slug/matches` | Matches in that league-country grouping |
| `GET /channels` | Discovered channel IDs, player providers, counts |
| `GET /channels/:id/matches` | All matches using a given channel ID |
| `GET /providers` | Hostnames and their option/match counts |
| `GET /providers/:host/matches` | Matches referencing that player provider |
| `GET /health` | API process health (does not probe source feed) |

### Examples

```bash
# Entire match directory, grouped and fully mapped in one response
curl 'http://localhost:3000/api/v1/catalog'

# Search by team name
curl 'http://localhost:3000/api/v1/matches?q=santos'

# Filter by the SOURCE's Lima-calendar date (not UTC date)
curl 'http://localhost:3000/api/v1/matches?date=2026-10-18'

# Specific match and its published channel options
curl 'http://localhost:3000/api/v1/matches/41326'
curl 'http://localhost:3000/api/v1/matches/41326/options'

# Dynamic league slugs come from GET /leagues. These are ILLUSTRATIVE slugs.
curl 'http://localhost:3000/api/v1/leagues/serie-a-italia/matches'

# Reuse a channel across every game that references it
curl 'http://localhost:3000/api/v1/channels/winsports2/matches'

# Same channel ID could exist at multiple providers: restrict to one if needed
curl 'http://localhost:3000/api/v1/channels/espn/matches?provider=tvf90.com'

# Find all matches served by a provider
curl 'http://localhost:3000/api/v1/providers/tvf90.com/matches'

# Date + search + status + pagination
curl 'http://localhost:3000/api/v1/matches?q=santos&limit=10&offset=0'
```

Query parameters for `/matches`, `/catalog` and applicable `*/matches` routes:

| Parameter | Description |
|---|---|
| `q` | Case-insensitive substring search over matches, leagues and options |
| `date` | YYYY-MM-DD, the upstream `date_diary` in **America/Lima** |
| `league` | League's `slug` or free-text league name (exact match) |
| `country` | Source country name (exact, case-insensitive) |
| `status` | `upcoming`, `live-inferred`, `finished-inferred`, `unknown` |
| `channel` | Exact channel ID |
| `provider` | Exact provider hostname |
| `limit` | 1–200, default 50 (paginated routes) |
| `offset` | Offset 0–100000, default 0 (paginated routes) |

The `/channels`, `/leagues`, and `/providers` collection routes also accept `q` and selected provider/country filters.

**Example response**, illustrating the structure (not a live result):

```json
{
  "total": 1,
  "limit": 50,
  "offset": 0,
  "hasMore": false,
  "items": [{
    "id": "41326",
    "description": "Brasileirão: Fluminense vs Santos",
    "league": "Brasileirão",
    "leagueSlug": "brasileirao-brasil",
    "country": "Brasil",
    "teams": "Fluminense vs Santos",
    "eventDate": "2026-10-18",
    "kickoff": "2026-10-18T19:00:00.000Z",
    "status": "upcoming",
    "options": [{
      "embedId": "10",
      "name": "Premiere 2",
      "provider": "tvf90.com",
      "channelId": "premiere2",
      "technology": "hls-clappr",
      "embedPageUrl": "https://futbollibrefullhd.org/embed/eventos.html?r=...",
      "playerPageUrl": "https://tvf90.com/1.php?stream=premiere2"
    }]
  }],
  "meta": {
    "upstream": "https://api.wqxag.com/diaries.json",
    "fetchedAt": "2026-10-18T19:00:00.000Z",
    "stale": false,
    "lastError": null,
    "refreshIntervalSeconds": 60,
    "statusIsInferred": true
  }
}
```

`status` is **not a live score or truth feed**. The source has no status flag. The API labels an event `live-inferred` from 15 minutes before kickoff through 135 minutes after kickoff; postponed matches and extra time will be inaccurate. The source sometimes includes NFL/MLB or other events alongside soccer—this API intentionally preserves **all published events** rather than misclassifying them as soccer.

## How the mapping works

```text
GET https://api.wqxag.com/diaries.json
 └── data[].attributes.diary_description, date_diary, diary_hour, country
 └── data[].attributes.embeds.data[]
       └── embed_name (button label)
       └── embed_iframe: /embed/eventos.html?r=<Base64 player-page URL>
             └── decode r → https://tvf90.com/1.php?stream=premiere2
                               └── provider = tvf90.com
                               └── channelId = premiere2
```

The channel ID corresponds to a broadcaster/feed, **not to a game**. Many games can reference the same channel and a game can provide multiple channel/options. A second provider's DRM-configured player URLs are categorized separately. This API deliberately never requests provider pages or raw signed `.m3u8` media.

**Upstream limitation:** `diaries.json` is a daily snapshot. Supplying `?date=` to *our* API filters the events already present in the feed; it does **not** magically query arbitrary future/past dates from the upstream (the report found source query parameters ignored).

## Reliability and configuration

The first request fetches upstream and parses it. Subsequent requests use a **60-second in-memory cache**, coalesce parallel loads, and serve the last successful snapshot with `meta.stale=true` if a refresh fails. When the first upstream request fails and nothing is cached, the API returns HTTP 503. `meta.fetchedAt` is the actual fetch time; matches' inferred statuses are recalculated on every request.

Environment variables:

```bash
PORT=3000                      # default 3000
DIRECTORY_URL=https://api.wqxag.com/diaries.json
CORS_ORIGIN=*                  # set your own frontend origin for deployment
```

For example:

```bash
PORT=8080 CORS_ORIGIN=https://your-app.example npm start
```

For deployment, run behind a TLS reverse proxy; apply rate limits and a persistence layer if needed. The API is intentionally **read-only**, has no user-supplied upstream URL (avoids becoming an open proxy), and only returns the URLs already in directory metadata. The endpoint `/health` only checks the process—not the source.

## Docker

```bash
docker build -t match-directory-api .
docker run --rm -p 3000:3000 match-directory-api
```

## File map

- `src/main.ts` — boot server
- `src/app.ts` — REST endpoints and search/pagination
- `src/store.ts` — fetch, 60-second cache, stale fallback, request coalescing
- `src/parse.ts` — resilient Strapi-style parser, Lima time conversion, Base64 decoding, provider classification
- `src/types.ts` — TypeScript API interfaces
- `test/api.test.ts` — four local automated tests (HTTP + parser + fallback)
