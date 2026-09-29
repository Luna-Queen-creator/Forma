// Forma service worker: makes the installed app open instantly and work offline.
// Your data is NOT here; it lives in the browser's local storage. This only caches the app's files.
//
// build.py stamps VERSION with a hash of the app files and fills PRECACHE, so every release
// installs as a new worker. The page then offers "Update" (it never reloads on its own).
'use strict';

const VERSION = 'dev';
const PRECACHE = [];
const APP_CACHE = 'forma-app-' + VERSION;
const FONT_CACHE = 'forma-fonts';

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's HTTP cache so a release never mixes old and new files.
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(['./', ...PRECACHE].map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('forma-app-') && k !== APP_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Web fonts: serve from cache, refresh in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Opening the app (any path or query inside the scope) always gets the cached page.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      return (await cache.match('./')) || (await cache.match('./index.html')) || fetch(request);
    })());
    return;
  }

  // App files: cache first, then network (and remember it for next time).
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  })());
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(response => {
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
  }).catch(() => hit);
  return hit || refresh;
}
