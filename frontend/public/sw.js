/* codeWithShivah service worker — deliberately small and safe.
   - Never touches API calls, other websites, or anything except GET.
   - Pages: always try the network first, so a new deploy shows up right away.
     Only when offline do we fall back to the last saved copy of the app.
   - /assets/* files have unique hashed names, so caching them is safe.
   To switch it off in an emergency: replace this file with the 3 lines at the bottom. */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, ASSETS];
    for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // API (Render), YouTube, Google, Cloudinary: untouched
  if (url.pathname.startsWith('/api')) return;

  // App pages (SPA routes): network first, offline fallback to the saved shell
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) caches.open(SHELL).then((c) => c.put('/', fresh.clone())).catch(() => {});
        return fresh;
      } catch {
        return (await caches.match('/')) || new Response('You are offline. Reconnect and try again.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Hashed build files: cache first (their names change on every deploy)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    })());
  }
});

/* Emergency off-switch (replace the whole file with this):
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister().then(() => self.clients.matchAll()).then((cs) => cs.forEach((c) => c.navigate(c.url)))));
*/
