// Service Worker for PWA functionality
const CACHE_NAME = 'ridealert-driver-v1';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Fetch event - exclude API calls from caching
self.addEventListener('fetch', (event) => {
  // Don't cache API requests
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Don't cache socket.io requests
  if (event.request.url.includes('socket.io')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Cache other requests
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
      .catch(() => {
        // If both cache and network fail, return a basic response for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
        throw error;
      })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});