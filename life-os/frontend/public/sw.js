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

const CACHE_VERSION = "v110-20260427-transfer-date-fix";
const CACHE_NAME = `lifeos-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/today",
  "/inbox",
  "/todos",
  "/projects",
  "/ideas",
  "/notes",
  "/notes/detail",
  "/notebooks",
  "/notebooks/detail",
  "/notebooks/search",
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
  "/settings",
  "/review",
  "/graph",
  "/vault",
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

// ─── Push notifications ────────────────────────────────────────────────────
// 後端 send payload JSON: { title, body, url, tag }

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "life-os", body: event.data.text() };
    }
  }
  const title = data.title || "life-os";
  const options = {
    body: data.body || "",
    tag: data.tag || "lifeos-notification",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(targetUrl).catch(() => {});
          return w.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
