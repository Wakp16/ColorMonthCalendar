const cacheName = 'momentum-cache-v1';
const filesToCache = [
  './index.html',
  './manifest.json',
  './service-worker.js',
  'https://cdn.jsdelivr.net/npm/fullcalendar/index.global.min.js'
];

// Install event – cache all necessary files
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(cacheName)
      .then(cache => cache.addAll(filesToCache))
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
});

// Fetch event – serve from cache if available, else fetch from network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
