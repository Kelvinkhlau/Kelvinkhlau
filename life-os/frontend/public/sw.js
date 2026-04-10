/**
 * life-os Service Worker — PWA offline cache.
 *
 * 策略：
 * - HTML pages: network-first, fallback to cache
 * - Static assets (JS/CSS/images): cache-first
 * - API calls: network-only (唔 cache API data)
 */

const CACHE_NAME = "lifeos-v1";
const STATIC_ASSETS = [
  "/",
  "/todos",
  "/projects",
  "/ideas",
  "/notes",
  "/expenses",
  "/calendar",
  "/report",
  "/assistant",
  "/vip",
  "/audit",
  "/login",
];

// Install — pre-cache key pages
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip API and WebSocket requests
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws")) {
    return;
  }

  // Static assets (JS, CSS, images) — cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/) ||
    url.pathname.startsWith("/_next/")
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  // HTML pages — network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
