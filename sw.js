// Bump VERSION whenever app shell files change to invalidate clients' caches.
const VERSION = 'v4';
const CACHE_NAME = `finance-tracker-${VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './landing.html',
  './styles.css',
  './manifest.json',
  './app.js',
  './js/autocomplete.js',
  './js/chart.js',
  './js/db.js',
  './js/demo.js',
  './js/import-export.js',
  './js/modal.js',
  './js/navigation.js',
  './js/rename-tag.js',
  './js/storage.js',
  './js/transactions.js',
  './js/ui.js',
  './js/utils.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Network-first for the Chart.js CDN: prefer fresh, fall back to cached copy offline.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (app shell + same-origin assets).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
