const CACHE_NAME = 'secure-link-v1';
const APP_SHELL = [
  './index.html',
  './style.css',
  './crypto.js',
  './webrtc.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
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
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first for CDN libs (QR code, jsQR); cache-first for the app shell.
  const url = event.request.url;
  if (url.startsWith('http') && !url.includes(self.location.host)) {
    return; // let CDN requests pass straight through
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
