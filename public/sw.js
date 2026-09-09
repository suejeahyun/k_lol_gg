const CACHE_NAME = "klol-v2-static-v2";
const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/images/brand/v2-hero-ahri-1600.webp",
  "/images/champions/lulu-card.avif",
  "/images/home/pastel-breeze-frame-v1.avif",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function isPublicStatic(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/_next/static/")) return true;
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/brand/") ||
    url.pathname.startsWith("/images/champions/") ||
    url.pathname.startsWith("/images/home/")
  ) {
    return /\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i.test(url.pathname);
  }
  return false;
}

self.addEventListener("fetch", (event) => {
  if (!isPublicStatic(event.request)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  })));
});
