/**
 * life-os Service Worker — PWA offline cache.
 *
 * 策略：
 * - HTML pages: network-first, fallback to cache
 * - _next/static (hashed filenames): cache-first (hash 變 = 新 URL)
 * - Other static assets: network-first with cache fallback
 * - API calls: network-only
 *
 * 每次 deploy 後改 CACHE_VERSION 強制更新。
 */

const CACHE_VERSION = "v5-20260413a";
const CACHE_NAME = `lifeos-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/inbox",
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
  "/subscriptions",
  "/budgets",
  "/bank-accounts",
  "/backups",
];

// Install — pre-cache key pages
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean ALL old caches
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

  // _next/static assets (hashed filenames → cache-first is safe)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
      )
    );
    return;
  }

  // Everything else (HTML pages, icons, manifest) — network-first
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
