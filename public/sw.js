/*
 * MatchNest service worker — APP SHELL CACHING ONLY.
 * Never caches API responses, video/media, captions or any cross-origin
 * request. Scores and streams always come from the network.
 */
const VERSION = "v1";
const SHELL = `matchnest-shell-${VERSION}`;
const PRECACHE = ["/following", "/live", "/offline", "/manifest.webmanifest", "/icons/192", "/icons/512"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("matchnest-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isShellAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch third-party / stream hosts
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/demo/")) return; // live data + media: network only
  if (req.headers.has("range")) return;

  if (req.mode === "navigate") {
    // network-first for pages, fall back to cached shell, then offline page
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && PRECACHE.includes(url.pathname)) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/offline")) || Response.error()),
    );
    return;
  }

  if (isShellAsset(url)) {
    // hashed build assets are immutable: cache-first
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
