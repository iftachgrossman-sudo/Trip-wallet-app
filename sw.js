// Service worker: keeps the page available offline. Data (/api/) is handled by the page itself.
const CACHE = 'trip-wallet-v3';
// Paths are relative to where the app lives, so it works at the site root and under a sub-path (GitHub Pages).
const SHELL = ['./', 'manifest.webmanifest', 'icon.svg', 'icon-512.png', 'apple-touch-icon.png'].map(p => new URL(p, self.registration.scope).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Cache what we can; a file that fails (e.g. login expired) must not block installation.
    await Promise.all(SHELL.map(async path => {
      try {
        const r = await fetch(path, { credentials: 'same-origin', cache: 'no-cache' });
        if (r.ok) await cache.put(path, r);
      } catch {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  const key = req.mode === 'navigate' ? SHELL[0] : url.origin + url.pathname;
  // Network first, so updates show up right away. Fall back to the cached copy when offline,
  // or when a weak connection takes longer than 4 seconds.
  event.respondWith((async () => {
    const cached = await caches.match(key);
    // cache: 'no-cache' asks the host whether the file changed instead of trusting the browser's
    // copy (GitHub Pages lets browsers keep files for 10 minutes), so updates show up right away.
    const fresh = req.mode === 'navigate' ? fetch(req.url, { credentials: 'same-origin', cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
    const network = fresh.then(r => {
      if (r.ok) {
        const copy = r.clone();
        event.waitUntil(caches.open(CACHE).then(c => c.put(key, copy)));
      }
      return r;
    });
    if (!cached) return network;
    event.waitUntil(network.catch(() => {}));
    const timeout = new Promise(resolve => setTimeout(() => resolve(cached), 4000));
    return Promise.race([network.catch(() => cached), timeout]);
  })());
});
