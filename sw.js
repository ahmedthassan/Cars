// Offline service worker.
//
// The whole game is a few hundred KB of static files with no network calls at
// runtime, so it can be cached in full and then genuinely never need a
// connection again. The precache list is injected at build time from what
// actually shipped — a hand-maintained list goes stale and half-loads the game
// offline, which is worse than not caching at all.

const CACHE = 'robot-haul-__BUILD__';
const ASSETS = /* __PRECACHE__ */[];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Cache-first: these files only change when a new version is deployed, and a
  // new deploy brings a new cache name with it.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
