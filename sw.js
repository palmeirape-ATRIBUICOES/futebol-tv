// ===== SERVICE WORKER — FUTEBOL TV =====
const CACHE_NAME = 'futebol-tv-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/auth.js',
    '/firebase-config.js',
    '/manifest.json',
    '/images/hero_bg.png'
];

// Install
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch — Network first, fallback to cache
self.addEventListener('fetch', e => {
    // Skip non-GET and external requests
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('firebasejs') || e.request.url.includes('hls.js')) return;

    e.respondWith(
        fetch(e.request)
            .then(res => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                return res;
            })
            .catch(() => caches.match(e.request))
    );
});
