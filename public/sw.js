/*
 * Streamline IPTV — service worker
 * --------------------------------
 * Framework-agnostic vanilla JS.
 *
 * Strategy:
 *   - Install:  precache the offline app shell ("/", "/logo.svg", "/manifest.webmanifest").
 *   - Fetch:    cache-first for same-origin GET requests, EXCEPT:
 *                 * /api/*          -> network only (proxy, server actions)
 *                 * stream URLs     -> network only (.m3u8, .ts, .flv, .mp4, .m4s, .m4v, .mpd)
 *               If a cached resource is missing, fall back to network; cache
 *               successful same-origin GETs for next time.
 *   - Activate: delete old caches.
 */

const SHELL_CACHE = "streamline-shell-v1";
const RUNTIME_CACHE = "streamline-runtime-v1";
const ALL_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

const PRECACHE_URLS = [
  "/",
  "/logo.svg",
  "/manifest.webmanifest",
];

// Extensions / patterns that must NEVER be cached (live streams & media segments).
const STREAM_PATTERN = /\.(m3u8|ts|flv|mp4|m4s|m4v|mpd|key)(\?|$)/i;
const API_PATTERN = /^\/api\//;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `addAll` is atomic; ignore failures on individual resources
      // (e.g. the offline shell may include a redirect from "/" to "/?...").
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch (_) {
            /* ignore individual precache failures */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !ALL_CACHES.includes(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET / HEAD; let the browser handle the rest.
  if (req.method !== "GET" && req.method !== "HEAD") return;

  // Don't intercept non-http(s) schemes (chrome-extension://, data:, blob:).
  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Streams bypass the cache entirely — they must always hit the network.
  if (STREAM_PATTERN.test(url.pathname) || STREAM_PATTERN.test(url.href)) {
    return; // let the browser fetch directly
  }

  // API routes always go to network (proxy must never be cached, server actions, etc.).
  if (url.origin === self.location.origin && API_PATTERN.test(url.pathname)) {
    return;
  }

  // For cross-origin requests (e.g. logos, EPG XML, fonts), try network-first
  // but fall back to cache. We don't pre-cache these.
  if (url.origin !== self.location.origin) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Same-origin GET (app shell, JS bundles, CSS, fonts, images):
  // cache-first, falling back to network and caching the response.
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    // Refresh in the background (stale-while-revalidate-ish).
    fetchAndCache(req).catch(() => {});
    return cached;
  }
  try {
    return await fetchAndCache(req);
  } catch (e) {
    // If offline and the request is a navigation, serve the offline shell.
    if (req.mode === "navigate") {
      const shell = await caches.match("/");
      if (shell) return shell;
    }
    throw e;
  }
}

async function networkFirst(req) {
  try {
    return await fetchAndCache(req);
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }
}

async function fetchAndCache(req) {
  const res = await fetch(req);
  if (!res || res.status !== 200 || res.type === "opaque") return res;
  // Don't cache streaming responses (already excluded by pattern, but guard anyway).
  const ct = res.headers.get("content-type") || "";
  if (/video|media|x-mpegurl|mpegurl/i.test(ct)) return res;
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(req, res.clone());
  } catch (_) {
    /* storage quota etc — ignore */
  }
  return res;
}

// Allow the page to trigger an immediate update.
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
