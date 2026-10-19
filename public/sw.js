/* Noctis is private. Remove legacy offline caches; all requests use the network. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("matchnest-")).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});
