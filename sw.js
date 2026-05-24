/* ============================================================
   ESSENSPLANER – Service Worker
   App-Shell (HTML, CSS, Icons) wird gecacht -> App startet offline.
   JS-Dateien: immer Netz-First, Cache nur als Offline-Fallback
   -> kein Cache-Bump nötig nach Code-Updates.
   API-Aufrufe gehen immer ans Netz.
   ============================================================ */
const CACHE = 'essensplaner-v5';

// Nur statische Shell pre-cachen – KEINE JS-Dateien
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './icons/icon.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// API-Hosts, die NICHT aus dem Cache bedient werden:
const LIVE_HOSTS = ['supabase.co', 'spoonacular.com', 'openstreetmap.org', 'openfoodfacts.org'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // API-Aufrufe: nie cachen, normal ans Netz
  if (LIVE_HOSTS.some((h) => url.hostname.includes(h))) return;

  // JS-Dateien: Netz-First, Cache nur als Offline-Fallback
  // -> Code-Änderungen auf GitHub sind sofort sichtbar
  if (url.pathname.endsWith('.js')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App-Shell (HTML, CSS, Icons): Cache-First
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});

// App kann ein sofortiges Update auslösen
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
