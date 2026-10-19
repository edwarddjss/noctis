# MatchNest

A mobile-first soccer **Progressive Web App**. Follow teams, players and leagues; see live scores across competitions; and, when a licensed provider or administrator has supplied one, watch an **authorized** stream. Includes multi-view (up to 4 streams) and AirPlay.

> **Data:** real teams, leagues, players, live scores and tables from **ESPN's free public soccer JSON**: 36 competitions (Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, MLS, Champions League, cups and more; edit `src/lib/providers/sports/espn-leagues.ts`). No key or account needed.
>
> ⚠️ ESPN's endpoints are **undocumented and unofficial**. ESPN publishes no terms or rate limits for them, and they can change or stop without notice. Every call goes through one shared server cache, so traffic stays low however many people use the app. For a commercial launch, switch to a licensed feed (`SPORTS_PROVIDER=api-football` is already built).
>
> **Video:** not set up yet. Every match shows "No authorized stream available" until you add streams you have rights to (see [Adding authorized streams](#adding-authorized-streams)).

MatchNest never scrapes, restreams, proxies or bypasses anything. It plays only stream URLs listed in an admin config, on allowlisted hosts. If a match has none, it says **"No authorized stream available"** and still shows the live score.

---

## What's in the app

- **Following:** search and follow teams, players (adds their club's matches) and leagues. "Popular leagues" are shown on first launch.
- **Live / Matches:** live scores across 36 competitions, grouped by league, biggest first. A day strip covers yesterday through next week.
- **Match:** score, minute, goal and card events, line-ups with formations.
- **Team:** next matches, results, squad, link to the league table.
- **League:** fixtures, results and the table, with your teams highlighted.
- **Video (later):** Watch, Multi-view (up to 4) and AirPlay are built in and turn on when an authorized stream source is configured. Until then the video UI stays hidden apart from a "No authorized stream available" note on match pages.

## Quick start

```bash
npm install
cp .env.example .env.local      # ESPN data by default, no keys needed
npm run dev                     # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest): provider adapters, follows, fetch/retry, stream policy, SSRF |
| `npm run test:e2e` | End-to-end tests (Playwright, mobile Chromium) against a production build |
| `npm run demo-media` | Regenerates the synthetic demo video in `public/demo` (needs ffmpeg) |

### Switching to a licensed feed (API-Football)

1. Get a plan from [API-Sports / API-Football](https://www.api-football.com/). It's a documented commercial API covering 1,000+ leagues and cups, with teams, squads, players, fixtures and live scores.
2. In `.env.local`: `SPORTS_PROVIDER=api-football` and `API_FOOTBALL_KEY=<your key>`.
3. The key stays on the server. It is sent only in the `x-apisports-key` header from API routes and never reaches the browser.

The free plan blocks some parameters this app uses (`next`/`last` fixtures) and some seasons. The adapter reports these as "not available on the current plan" rather than failing silently.

### Adding authorized streams

1. Copy `config/authorized-streams.example.json` → `config/authorized-streams.json` and fill it in from your distribution agreement (provider, allowed hosts, authorized competitions, per-match URLs and availability windows).
2. Set `STREAM_PROVIDER=config`, `STREAM_CONFIG_PATH=./config/authorized-streams.json`, and `STREAM_HOST_ALLOWLIST=<provider hosts>`.
3. Rebuild, because CSP `media-src` and `connect-src` are built from the allowlist.
4. Optional check: `POST /api/admin/streams/validate` with `Authorization: Bearer $ADMIN_API_TOKEN` and `{"matchId":"…","probe":true}`.

---

## Install on iPhone

1. Open the deployed HTTPS URL in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch MatchNest from the Home Screen. It runs full-screen as a standalone app.

Notes: iOS requires HTTPS (localhost is fine for dev on a Mac). Follows are stored per install, so the Home Screen app and the Safari tab have separate storage. Video always needs a connection; the service worker caches only the app shell.

---

## Why a web app (and what it gives up)

We weighed a native iPhone app (Expo/React Native) against this web app and chose web: free to ship, no App Store review, one codebase. The trade-offs on iPhone:
- **No lock-screen scores or widgets:** Live Activities, the Dynamic Island and widgets need a native app.
- **Weaker goal alerts:** web push works only after Add to Home Screen (iOS 16.4+) and is less reliable than native push.
- **Picture-in-picture:** reported broken in Home Screen web apps ([WebKit bug 303885](https://bugs.webkit.org/show_bug.cgi?id=303885)). It works in Safari tabs.
- **Follows can be wiped:** iOS may clear web storage. Account sync (`/api/sync`) is the fix when needed.

The data and server layers (`src/lib/**`, `src/app/api/**`) are framework-agnostic TypeScript, so a native app can be added later on the same backend.

## Stack choices

| Choice | Why |
| --- | --- |
| **Next.js 16 (App Router) + React 19 + TypeScript** | One codebase for UI and server routes. Provider keys stay in route handlers. Current stable release. |
| **Zod 4** | Runtime validation of every external payload (provider responses, admin config, localStorage, our own API on the client). |
| **hls.js 1.7** | HLS fallback only where Safari-style native HLS is missing. Loaded on demand. |
| **Plain CSS with design tokens** | No UI framework needed for a small, dark, mobile-first design; no extra runtime cost. |
| **localStorage + `useSyncExternalStore`** | Simple, synchronous, validated follow storage with cross-tab sync; a `SyncAdapter` hook for account sync. |
| **Hand-written service worker** | Caches only the app shell. Small enough to audit; never touches API or media. |
| **Vitest + Playwright** | Fast unit tests; e2e tests on a real production build against a local ESPN stand-in server (`tests/e2e/espn-stub.mts`), so tests are deterministic and work offline. |

---

## Architecture

```
Browser (PWA)                               Server (Next.js route handlers)                   Upstream
─────────────                               ───────────────────────────────                   ────────
Following / Live / Match / Team pages ──▶  /api/search /api/feed /api/live   ──▶ SportsDataProvider ──▶ API-Football (licensed)
  useApi (abort, poll, backoff)             /api/matches/[id] /api/teams/[id]     ├ EspnProvider (default, free)
  FollowStore (localStorage, zod)           fetchJson: cache · retry · Retry-After · quota gate · validation
                                                                                   
Watch / Multi-view ──────────────────────▶ /api/streams/[matchId] ──────────▶ StreamProvider
  VideoPlayer ── native <video> (Safari HLS → AirPlay)                           ├ ConfigStreamProvider (admin JSON)
             └─ hls.js (MSE) fallback      Policy: provider ↔ competition ↔ match,  └ NoStreamProvider (default)
  useRemotePlayback (AirPlay / Remote Playback API)   https + host allowlist + window
                                            /api/admin/streams/validate ── SSRF-safe probe (admin token)
```

- **Adapters** (`src/lib/providers/**`) are the only code that knows a provider's wire format. Everything else uses the domain types in `src/lib/domain.ts`.
- **SportsDataProvider**: `searchTeams`, `searchPlayers`, `getTeam`, `getPlayer`, `getCompetitions`, `getFixtures`, `getLiveMatches`, `getMatchDetails`.
- **StreamProvider**: `getAuthorizedStreamForMatch`, `validateStream`, `getCaptions`, `getPlaybackMetadata`, plus `getAvailability` for list badges.
- Following a **player** also follows their current club's matches in the feed. Following a **league** adds its fixtures.

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Security & CSP: [`docs/SECURITY.md`](docs/SECURITY.md) · Launch list: [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md)

### Directory tree

```
├── config/authorized-streams.example.json   admin stream config (placeholders)
├── docs/                                    architecture, security/CSP, production checklist
├── public/
│   ├── sw.js                                app-shell-only service worker
│   └── demo/                                synthetic test-pattern media (playback tests only)
├── scripts/make-demo-media.sh               regenerates demo media with ffmpeg
├── src/
│   ├── app/
│   │   ├── following/  live/  multiview/    primary screens
│   │   ├── match/[id]  watch/[id]           match detail, single-stream playback
│   │   ├── team/[id]  player/[id]  competition/[id]
│   │   ├── api/…                            server routes (credentials live here only)
│   │   ├── icons/[size]/route.tsx           generated PNG app icons
│   │   ├── manifest.ts  layout.tsx  globals.css  offline/
│   ├── components/
│   │   ├── player/VideoPlayer.tsx           reusable authorized-stream player
│   │   └── MatchRow, ScoreHeader, FollowButton, TabBar, States, AirPlayHelp, …
│   └── lib/
│       ├── domain.ts  errors.ts  log.ts     domain types, typed errors, redacting logger
│       ├── http/                            fetchJson (retry/backoff/cache/abort), TTL cache
│       ├── providers/sports/                types, espn (+ league list), api-football
│       ├── providers/streams/               types, admin config schema, config + none providers
│       ├── playback/                        source selection, hls.js engine, AirPlay/remote
│       ├── security/                        stream URL policy, SSRF-safe probe
│       ├── server/                          provider registry, JSON responses
│       └── client/                          API client, follows store, hooks, formatting
└── tests/
    ├── unit/                                adapters, follows, fetch, stream policy/SSRF, source selection
    └── e2e/                                 Playwright user journeys
```

---

## Playback, multi-view and AirPlay

- **VideoPlayer** uses native `<video playsinline preload="none">` first and hls.js only as a fallback. Its states are idle → loading → playing / paused / buffering → reconnecting / ended / error, with separate messages for *unauthorized*, *unavailable*, *network*, *decode* and *unsupported*. Network errors reconnect with exponential backoff, and also retry when the device comes back online. A stall over 15 s triggers a reload. If a source fails, the next authorized source is tried. Controls: play/pause, mute, volume (hidden on iOS, where volume is hardware-only), captions (WebVTT), picture-in-picture, full screen and AirPlay. Keyboard shortcuts: Space/K, M, F, C, ↑/↓. Playback always starts from a tap, and is never autoplayed with sound.
- **Multi-view**: 1, 2 or 4 panels, each with its own match picker, mute and volume. All panels start muted. Expanding a panel pauses the others and stops their downloads; everything pauses while the app is in the background. A bandwidth/battery warning shows in the 4-panel layout. Unsupported or missing streams fail inside their own panel.
- **AirPlay**: uses only the WebKit playback-target API (`webkitShowPlaybackTargetPicker`) and the W3C Remote Playback API. The button appears only when the browser reports a receiver. While video plays on the TV, the phone shows "Playing on your TV" with controls and the score. The UI explains the conditions: browser, format (MSE/hls.js playback generally can't be AirPlayed), receiver, network and provider rules. **AirPlay and other casting are not guaranteed** on every browser or receiver.
- **Native wrapper (optional, not required):** a native iOS shell would add an Apple Developer Program membership, App Store review (including Guideline 5.2 on rights to content), `AVPlayer`/`AVRoutePickerView` for routing, the "Audio, AirPlay, and Picture in Picture" background mode, and possibly FairPlay DRM integration from the provider's SDK. The PWA stays fully functional without it.

---

## What needs a licence or agreement

| Part | Needs |
| --- | --- |
| Real teams, leagues, players, fixtures, live scores, logos | Works today for free via ESPN's unofficial endpoints (no licence, no guarantees). For a commercial or App Store launch, use a **licensed plan** (e.g. API-Football). Crest display is subject to the clubs' trademark rights. |
| `SPORTS_PROVIDER=api-football` adapter (optional) | An API-Football key (`API_FOOTBALL_KEY`). |
| Any video in Watch / Multi-view | A **distribution/streaming agreement** with the rights holder or an authorized provider, per competition and territory. Its URLs go in the admin config. |
| Signed/tokenized stream URLs, DRM (FairPlay/Widevine) | The provider's SDK or token API, implemented server-side at the marked extension point in `ConfigStreamProvider`. |
| AirPlay to TVs | Allowed by the stream provider (`airplayAllowed` per provider). |
| Account sync | Your own auth + storage backend (`/api/sync` is a 501 stub). |

Everything else (app shell, follows, UI, ESPN data, tests) runs with no account or key.

## Match directory API

The match directory is available at `/api/v1` through a Node.js Next.js route, including `/api/v1/catalog`, `/api/v1/matches`, `/api/v1/leagues`, and `/api/v1/health`. See [the endpoint reference](docs/MATCH_DIRECTORY.md). Optional server environment variables: `DIRECTORY_URL` and `CORS_ORIGIN`. Cache state is per warm Vercel instance; cold starts fetch a fresh snapshot. Directory match IDs are source IDs and are separate from the existing sports-provider IDs.
