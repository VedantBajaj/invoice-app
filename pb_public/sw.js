const CACHE_NAME = "invoice-v79";
const SHELL_ASSETS = [
  "/",
  "/css/app.css",
  "/js/api.js",
  "/js/app.js",
  "/js/lib/discount.js",
  "/js/lib/gst.js",
  "/js/lib/qrcode-gen.js",
  "/js/lib/quagga.min.js",
  "/js/pages/login.js",
  "/js/pages/dashboard.js",
  "/js/pages/invoice-new.js",
  "/js/pages/invoice-customer.js",
  "/js/pages/invoice-cart.js",
  "/js/pages/invoice-payment.js",
  "/js/pages/invoice-success.js",
  "/js/pages/invoice-list.js",
  "/js/pages/invoice-view.js",
  "/js/pages/products.js",
  "/js/pages/product-quick-add.js",
  "/js/pages/customers.js",
  "/js/pages/suppliers.js",
  "/js/pages/stock.js",
  "/js/pages/reports.js",
  "/js/pages/settings.js",
  "/js/pages/users.js",
  "/js/pages/import.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.json",
];

// Install: wipe old caches first, then cache fresh assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => caches.open(CACHE_NAME))
      .then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean any remaining old caches, claim clients, force reload
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      })
  );
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // API calls: network-only (no caching)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Our own JS/CSS/HTML: network-first, fall back to cache for offline
  if (url.hostname === location.hostname) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CDN resources (Alpine, Tailwind, PocketBase SDK): cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
