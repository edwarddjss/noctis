# Production-readiness checklist

## Licensing & content
- [ ] Signed sports-data licence (e.g. API-Football paid plan) covering the competitions, live data and logo display you need
- [ ] Distribution agreements for every stream in `authorized-streams.json`, per competition **and territory**
- [ ] Geo/entitlement checks required by those agreements implemented server-side (token minting at the `ConfigStreamProvider` extension point)
- [ ] DRM requirements (FairPlay/Widevine) confirmed with the provider; integrate via their SDK only
- [ ] `airplayAllowed` set per provider according to contract
- [ ] Terms of use and privacy policy published; club/league trademarks used per provider terms
- [ ] Mock banner gone (`SPORTS_PROVIDER` ≠ `mock`), demo streams disabled (`STREAM_PROVIDER=config`)

## Configuration & secrets
- [ ] `API_FOOTBALL_KEY`, `ADMIN_API_TOKEN` (≥ 32 random chars) stored in the host's secret manager
- [ ] `STREAM_HOST_ALLOWLIST` and `IMAGE_HOSTS` set **before** `next build` (CSP is build-time)
- [ ] `config/authorized-streams.json` validated at startup (invalid config refuses to serve streams)
- [ ] Admin validation endpoint reachable only from admin networks, or behind SSO

## Security
- [ ] Nonce-based CSP via `proxy.ts`; HSTS at the edge
- [ ] Dependency audit (`npm audit`) and Dependabot/Renovate enabled
- [ ] Rate limiting on `/api/*` at the edge (per IP), in addition to upstream quota handling
- [ ] Logs verified to contain no keys, tokens or full stream URLs

## Reliability & performance
- [ ] Shared cache (e.g. Redis) instead of the in-process TTL cache when running more than one instance
- [ ] Tune `CACHE_TTL_*` against your API quota (live ≈ 15–30 s)
- [ ] Alerting on `provider.*` / `api_football.*` warnings, 429 rates, and stream-error rates
- [ ] Load test `/api/live` and `/api/feed` at expected peak (match days)

## Quality
- [ ] `npm run typecheck && npm test && npm run test:e2e` green in CI
- [ ] Manual test on iPhone Safari + Home Screen install, AirPlay to an Apple TV, PiP, captions, lock-screen controls
- [ ] Manual test on Android Chrome (hls.js path, Remote Playback / cast)
- [ ] Accessibility pass (VoiceOver, keyboard-only, contrast, reduced motion)
- [ ] Service worker version bumped on releases that change the shell
