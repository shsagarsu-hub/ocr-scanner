const CACHE_NAME = 'ocr-mailer-v1';
const APP_SHELL = ['./index.html', './app.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first for the Apps Script API and the Tesseract CDN; cache-first for app shell.
  if (event.request.url.includes('script.google.com') || event.request.url.includes('cdnjs.cloudflare.com')) {
    return; // let it hit the network normally
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
