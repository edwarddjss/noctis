# Security & compliance

## Content rules enforced in code

- No arbitrary URL playback. The player only receives URLs from `/api/streams/[matchId]`, which come only from the admin config and pass `checkStreamUrl`.
- No iframes. `frame-src 'none'` and `frame-ancestors 'none'`.
- No scraping, ad blocking, header spoofing, referer or cookie manipulation, or DRM handling. The browser fetches exactly the authorized URL.
- No impersonation. Provider names come from the admin config, and demo media is labelled "Demo test pattern, not a real broadcast".

## Secrets

- `API_FOOTBALL_KEY` and `ADMIN_API_TOKEN` are server-only env vars (no `NEXT_PUBLIC_` prefix). `.env*` files are git-ignored.
- The logger (`src/lib/log.ts`) masks keys matching key/token/secret/password/authorization/cookie/signature/credential/session, and reduces every URL to origin + path (query strings carry tokens).
- Stream responses are sent with `Cache-Control: private, no-store`.

## SSRF

`/api/admin/streams/validate` requires a bearer token (24+ chars, compared in constant time). It only probes URLs already in the admin config, never URLs from the request. `probeStreamUrl` re-applies the allowlist, resolves DNS and rejects private, loopback, link-local, CGNAT, ULA, multicast and metadata ranges. It follows redirects manually, re-checking each hop (max 3), with a 5 s timeout and a 2 KB read. Residual risk: DNS rebinding between the lookup and the connection. Exact-host allowlists are the main control; for stronger isolation, run probes from an egress-restricted worker.

## Content Security Policy

Set in `next.config.ts` (computed at **build** time):

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://media.api-sports.io; media-src 'self' blob: <STREAM_HOST_ALLOWLIST>;
connect-src 'self' <STREAM_HOST_ALLOWLIST>; worker-src 'self' blob:; frame-src 'none';
frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

Hardening for production: replace `'unsafe-inline'` in `script-src` with a per-request nonce. Add `src/proxy.ts` (Next 16's renamed middleware) that generates a nonce, sets the CSP header with `'nonce-…' 'strict-dynamic'`, and passes it via a request header (see the Next.js "Content Security Policy" guide). Pages then render dynamically. Also add `Strict-Transport-Security` at your CDN/host.

`connect-src` must include stream hosts because hls.js fetches playlists and segments with XHR/fetch. Native Safari playback only needs `media-src`.

## Input validation

All ids are regex-validated, search terms are normalized and length-limited, `?add=` on multi-view is validated, and every external or stored payload is parsed with Zod.
