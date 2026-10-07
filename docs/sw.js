// Forma service worker: makes the installed app open instantly and work offline.
// Your data is NOT here; it lives in the browser's local storage. This only caches the app's files.
//
// build.py stamps VERSION with a hash of the app files and fills PRECACHE, so every release
// installs as a new worker. The page then offers "Update" (it never reloads on its own).
'use strict';

const VERSION = '78442431646a';
const PRECACHE = ["index.html", "style.css", "manifest.webmanifest", "js/library.js", "js/main.js", "js/model.js", "js/photos.js", "js/player.js", "js/pwa.js", "js/share.js", "js/stats.js", "js/stickers.js", "js/store.js", "js/ui.js", "js/util.js", "js/views/body.js", "js/views/exercises.js", "js/views/progress.js", "js/views/quick.js", "js/views/routines.js", "js/views/settings.js", "js/views/week.js", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon.svg", "icons/maskable-512.png", "icons/maskable.svg"];
const APP_CACHE = 'forma-app-' + VERSION;

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's HTTP cache so a release never mixes old and new files.
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(['./', ...PRECACHE].map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Old app versions go, and so do web fonts cached by versions before 0.8 (Forma no longer loads any).
    await Promise.all(keys.filter(k => (k.startsWith('forma-app-') && k !== APP_CACHE) || k === 'forma-fonts').map(k => caches.delete(k)));
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
