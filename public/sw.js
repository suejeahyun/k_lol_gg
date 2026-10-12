const CACHE_NAME = "klol-v2-static-v4";
const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/images/brand/v2-hero-ahri-1600.webp",
  "/images/champions/lulu-card.avif",
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
  const immutable = new URL(event.request.url).pathname.startsWith("/_next/static/");
  const refresh = async (cache) => {
    const response = await fetch(event.request, { cache: immutable ? "default" : "no-cache", signal: AbortSignal.timeout(5_000) });
    try {
      if (response.ok && response.type === "basic") await cache?.put(event.request, response.clone());
      else if (response.status === 404 || response.status === 410) await cache?.delete(event.request);
    } catch {
      // Cache quota/storage errors must never replace a successful network response.
    }
    return response;
  };
  // Content-hashed build files stay immutable. Fixed image/manifest URLs are revalidated.
  event.respondWith((async () => {
    let cache, cached;
    try {
      cache = await caches.open(CACHE_NAME);
      cached = await cache.match(event.request);
    } catch {
      // Browser storage can be unavailable even while the network is healthy.
    }
    if (immutable && cached) return cached;
    try { return await refresh(cache); }
    catch (error) { if (cached) return cached; throw error; }
  })());
});
