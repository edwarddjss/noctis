# Architecture

## Layers

1. **Domain** (`src/lib/domain.ts`): provider-neutral Zod schemas and types: `Team`, `Player`, `Competition`, `Match`, `MatchDetails`, `TeamDetails`.
2. **Adapters** (`src/lib/providers/**`): map provider wire formats into domain types. Server-only.
   - `sports/mock.ts`: fictional data. Today's fixtures cycle scheduled → live → HT → FT every 150 min so there is always something live. `MOCK_FREEZE_TIME` pins the clock for tests and demos.
   - `sports/api-football.ts`: API-Football v3. Every item is validated on its own (one bad record is dropped, not fatal). The `errors` envelope is classified (`unauthorized`, `rate_limited`, `plan_restricted`). Quota headers are tracked (`x-ratelimit-requests-remaining`, `x-ratelimit-remaining`), and upstream calls stop until the reset.
   - `streams/config-provider.ts`: admin-config-backed authorized streams.
   - `streams/mock.ts`: the same provider over a built-in config pointing at `/public/demo` test patterns.
3. **HTTP** (`src/lib/http/fetch-json.ts`): timeout + caller abort (`AbortSignal.any`), retries with full-jitter exponential backoff, `Retry-After`, schema validation, TTL/LRU cache, stale-on-error, in-flight de-duplication, and a pre-flight quota gate.
4. **Registry** (`src/lib/server/registry.ts`): picks adapters from env vars (`SPORTS_PROVIDER`, `STREAM_PROVIDER`).
5. **Route handlers** (`src/app/api/**`): validate input (ids `^[A-Za-z0-9_-]{1,40}$`, search 3–40 letters/numbers), map errors to status codes, and set cache headers. Stream responses are `private, no-store`.
6. **Client** (`src/lib/client/**`): typed and validated `apiGet`; `useApi` (abort on unmount, polling paused while hidden, backoff on errors); `FollowStore`.

## Data flow: Following feed

`FollowStore` → `feedTeamIds` (followed teams + followed players' clubs) + `feedCompetitionIds` → `GET /api/feed?teams=…&competitions=…`. The server fans out `getFixtures(next/last)` per id with `Promise.allSettled` (partial failures are flagged, not fatal), de-duplicates, sorts live first, and attaches stream availability.

## Follows & sync

- Stored in `localStorage["matchnest:follows:v1"]`, validated on every load. Corrupt data resets to empty.
- Cross-tab updates via the `storage` event.
- `SyncAdapter { pull, push }` with `HttpSyncAdapter` → `/api/sync`. The server route is a 501 stub until you add authentication and storage. Merge is last-writer-wins on the whole document. If you need concurrent multi-device edits, switch to per-item timestamps + tombstones.

## Admin stream model

```jsonc
{
  "version": 1,
  "providers":    [{ "id", "name", "allowedHosts": ["cdn.host"], "airplayAllowed", "rightsNote" }],
  "competitions": [{ "competitionId", "providerId" }],          // what each provider is licensed for
  "streams":      [{ "matchId", "competitionId", "providerId", "label",
                     "sources": [{ "url", "type": "hls|mp4|webm" }], "captions": [...],
                     "availableFrom", "availableUntil" }]
}
```

A stream is served only if all of these hold: the provider exists, the competition is authorized for that provider, the current time is inside the window, every source and caption URL is https on a host in **both** the provider's `allowedHosts` and `STREAM_HOST_ALLOWLIST`, there are no credentials in the URL, the port is the default, and the host is a DNS name (not an IP). The config is validated at startup; an invalid config refuses to serve any streams.

## Playback

`selectSource` → `attachSource` (native or hls.js) → `VideoPlayer` state machine. Native HLS is preferred because it is what Safari can AirPlay. hls.js is used only when native HLS is missing and MSE can decode H.264/AAC. On `unavailable`, `decode` or `unsupported`, the next authorized source is tried. `unauthorized` (401/403) is terminal and shown as such.

## Native wrapper (optional)

See README → "Native wrapper". The web app needs no native code.
