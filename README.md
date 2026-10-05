# Streamline IPTV

> A premium, cinematic IPTV player built on Next.js 16. Bring your own M3U / Xtream Codes sources and watch on any device — fast, keyboard-friendly, and 100% player-only. Streamline ships with **no channels, playlists, or streams**: it is a viewer for content you already have the right to access.

---

## Features

### Sources & Onboarding
- Add channels from a public **M3U / M3U8 URL**, an uploaded `.m3u` file, pasted raw `#EXTM3U` text, or an **Xtream Codes** account (planned).
- One-click **legal demo** seeded from public test HLS streams (Big Buck Bunny, Sintel, Tears of Steel, Apple BipBop, Mux) so you can try the player immediately without any source.
- A guided onboarding wizard with progress, parsing off the main thread, and graceful error handling.
- Multiple playlists side-by-side with an instant switcher.

### Live TV
- Virtualized, GPU-friendly channel grid that scales to **tens of thousands of channels** without dropping a frame.
- Group filter, language filter, quality filter (HD/FHD/4K), favorites, recents, and a fuzzy search powered by Fuse.js.
- Per-channel `User-Agent` / `Referer` overrides parsed from `#EXTVLCOPT` / `#KODIPROP`.

### EPG
- XMLTV (`<tv>` programme) parser that runs in a Web Worker.
- Per-`tvg-id` programme cache in IndexedDB with a sliding window query for the live guide grid.
- "Now / Next" overlay in the player and a full day-grid in the Guide view.

### Player
- Smart engine auto-detection from URL/extension: **hls.js** for `.m3u8`, **mpegts.js** for `.ts` / `.flv`, **native `<video>`** for `.mp4` / `.webm` / `.mov`, with Safari native HLS fallback.
- Low-latency mode, configurable buffer, quality / audio-track / subtitle-track switchers.
- Full keyboard control, custom controls overlay, info overlay, and zappable channel queue.

### Personalization
- Dark-first cinematic theme with a rose-red accent, glassmorphism panels, and an 8px grid system.
- Per-user profiles, custom favorites lists, watch history with resume positions, and a settings store backed by Dexie.
- Configurable accent color, motion reduction, auto-hide controls, autoplay-next.

### PWA
- Installable, offline-capable shell via `manifest.webmanifest` + `/sw.js`.
- Cache-first for the app shell; streams **bypass** the cache (no `.m3u8` / `.ts` / `.flv` / `.mp4` is cached).
- Apple touch icon, maskable icon, standalone display, any orientation.

### Performance
- Web Workers for M3U / XMLTV parsing.
- TanStack Query for server state, TanStack Virtual for long lists.
- Zustand for surgical client re-renders.
- IndexedDB (via Dexie) for playlists, channels, favorites, history, EPG, settings, profiles.
- Framer Motion springs for fluid, GPU-accelerated transitions.

### Security
- Optional **CORS proxy** (Cloudflare Worker, Docker, or the bundled Next.js `/api/proxy` route) with **private-IP blocking** (loopback, RFC1918, link-local, ULA) so the proxy cannot be turned into an open SSRF relay.
- No telemetry, no analytics, no third-party trackers.
- All channel data lives locally in your browser — there is no server-side database of your subscriptions.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, standalone output) |
| Language | TypeScript 5 |
| UI | Tailwind CSS 4, shadcn/ui, Radix primitives, Framer Motion, lucide-react |
| Player | hls.js 1.7, mpegts.js 1.8, native HTML5 video |
| State | Zustand (client), TanStack Query (server) |
| Storage | Dexie 4 (IndexedDB) |
| Lists | TanStack Virtual |
| Search | Fuse.js |
| Workers | Native Web Workers (M3U / XMLTV parsing) |
| Package manager | bun |
| Runtime | Bun (dev), Node 20+ (production standalone) |

---

## Quick start

This project is configured for the **Zai sandbox preview environment**. Do not try to open `localhost:3000` directly — the dev server is exposed through the **Preview Panel**.

```bash
# 1. Install dependencies
bun install

# 2. Start the dev server
bun run dev
```

Then, in the sandbox IDE:
1. Open the **Preview Panel** (the webview on the right of the editor).
2. Wait for the Next.js dev server to attach (the page auto-reloads on save).
3. Click **"Open in New Tab"** in the Preview Panel toolbar for the full-screen experience (recommended for the player overlay, fullscreen, and PWA installability).

> Why not `localhost:3000`? The sandbox tunnels the dev server through a preview URL with authentication; the Preview Panel handles that automatically. Using "Open in New Tab" also gives you a real browser context so the service worker, IndexedDB, and PWA install prompts work as expected.

---

## Add your first source

When you first launch Streamline, the onboarding wizard appears. You have four paths:

1. **Try the demo (one click).** Seeds a legal test playlist (Big Buck Bunny, Sintel, Tears of Steel, Apple BipBop, Mux). No URL, no upload, no account. Best way to kick the tires.
2. **M3U / M3U8 URL.** Paste a public link to your `.m3u` or `.m3u8` playlist. If the host blocks cross-origin requests, you will see a CORS error — enable the proxy in **Settings → Network → Use proxy** and supply a `PROXY_URL` (see [CORS proxy deployment](#cors-proxy-deployment)).
3. **Upload `.m3u` file.** Choose a file from your device. The file is read locally and parsed in a Web Worker; it never leaves your browser.
4. **Paste raw M3U text.** Paste `#EXTM3U` content directly into the textarea. Useful for testing snippets or for sources you have in a password manager / note.

After the source is parsed, the wizard shows the channel count and lands you on the **Live TV** grid. Use the sidebar (desktop) or the bottom tab bar (mobile) to switch between Home, Live, Guide, Movies, Series, Favorites, History, Search, and Settings. You can add more sources at any time from the **Add source** button in the sidebar footer.

---

## Environment variables

The Streamline player itself requires **no environment variables** to run. The following are only relevant when you deploy the optional CORS proxy.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PROXY_URL` | No | — | Public base URL of your deployed CORS proxy (e.g. `https://streamline-proxy.example.workers.dev`). Used by the player when **Settings → Network → Use proxy** is on. If unset, the player falls back to the same-origin `/api/proxy` route bundled with this app. |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated list of origins allowed to call the proxy (for the Cloudflare Worker / Docker variant). Use a restrictive list in production. |

Copy `.env.example` (create one if you wish) to `.env.local` for local Next.js development. The bundled `/api/proxy` route does not need any env vars — it inherits the deployment origin.

---

## CORS proxy deployment

Many M3U hosts and CDNs do not send `Access-Control-Allow-Origin`, so a browser playing an HTTPS page cannot fetch an HTTP stream or a cross-origin HTTPS stream. Streamline includes a tiny, dependency-free proxy that you can deploy three ways.

### Option A — Cloudflare Worker (recommended for production)

Create a Worker at `streamline-proxy` and paste the script below. It takes `?url=<encoded>`, validates the host against private IP ranges, forwards an optional `?ua=` and `?ref=`, sets permissive CORS headers, and rate-limits by IP using the Workers Cache API.

```js
// streamline-proxy.worker.js
// Deploy: wrangler deploy streamline-proxy.worker.js --name streamline-proxy

const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());

// Private IPv4/IPv6 ranges we refuse to proxy to (anti-SSRF).
function isPrivateHost(host) {
  // Strip bracket notation for IPv6
  const h = host.replace(/^\[|\]$/g, "");
  // IPv4
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [ +v4[1], +v4[2] ];
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // 127.0.0.0/8
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 169 && b === 254) return true;         // 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true;// 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a >= 224) return true;                       // multicast / reserved
  }
  // IPv6 common private
  const lower = h.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("fe8") || lower.startsWith("fe9") ||
      lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local fe80::/10
  return false;
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)
    ? (origin || "*")
    : ALLOWED_ORIGINS[0] || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Vary": "Origin",
  };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(url.origin || "*") });
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(url.origin || "*") });
    }
    const target = url.searchParams.get("url");
    if (!target) return new Response("Missing ?url", { status: 400, headers: corsHeaders(url.origin || "*") });
    let targetUrl;
    try { targetUrl = new URL(target); }
    catch { return new Response("Invalid url", { status: 400, headers: corsHeaders(url.origin || "*") }); }
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      return new Response("Blocked: non-http(s)", { status: 403, headers: corsHeaders(url.origin || "*") });
    }
    if (isPrivateHost(targetUrl.hostname)) {
      return new Response("Blocked: private IP", { status: 403, headers: corsHeaders(url.origin || "*") });
    }

    // Rate limit by IP (per-minute, 120 req).
    const ip = req.headers.get("CF-Connecting-IP") || "anonymous";
    const key = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
    const cache = caches.default;
    const countRes = await cache.match(new Request(`https://internal/${key}`));
    const count = countRes ? parseInt(await countRes.text(), 10) : 0;
    if (count > 120) {
      return new Response("Rate limit exceeded", { status: 429, headers: corsHeaders(url.origin || "*") });
    }
    ctx.waitUntil(cache.put(
      new Request(`https://internal/${key}`),
      new Response(String(count + 1), { headers: { "Cache-Control": "max-age=120" } }),
    ));

    // Forward with optional UA / Referer.
    const headers = new Headers();
    const ua = url.searchParams.get("ua");
    const ref = url.searchParams.get("ref");
    headers.set("User-Agent", ua || "Mozilla/5.0 (compatible; StreamlineProxy/1.0)");
    if (ref) headers.set("Referer", ref);
    if (targetUrl.username) targetUrl.username = "";
    if (targetUrl.password) targetUrl.password = "";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        signal: controller.signal,
        redirect: "follow",
      });
      const respHeaders = corsHeaders(url.origin || "*");
      const ct = upstream.headers.get("content-type");
      if (ct) respHeaders["Content-Type"] = ct;
      return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
    } catch (e) {
      return new Response("Upstream error: " + (e?.message || "timeout"), {
        status: 502,
        headers: corsHeaders(url.origin || "*"),
      });
    } finally {
      clearTimeout(timeout);
    }
  },
};
```

Deploy with `wrangler`:

```bash
npm i -g wrangler
wrangler deploy streamline-proxy.worker.js --name streamline-proxy --var ALLOWED_ORIGINS:https://your-app.example.com
```

Set `PROXY_URL=https://streamline-proxy.<your-subdomain>.workers.dev` in the Streamline app's environment, then enable **Settings → Network → Use proxy**.

### Option B — Docker Node/Express service

For self-hosting on your own infrastructure. Three files:

**`server.js`**
```js
import http from "node:http";
import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { URL } from "node:url";

const PORT = process.env.PORT || 8787;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
const DEFAULT_UA = "Mozilla/5.0 (compatible; StreamlineProxy/1.0)";

function isPrivateHost(host) {
  const h = host.replace(/^\[|\]$/g, "");
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [ +v4[1], +v4[2] ];
    if ([10, 127, 0].includes(a)) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
  }
  const lower = h.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(lower)) return true;
  return false;
}

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)
    ? (origin || "*") : (ALLOWED_ORIGINS[0] || "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Vary": "Origin",
  };
}

const rateMap = new Map(); // ip -> { count, windowStart }
function rateLimited(ip) {
  const now = Date.now();
  const e = rateMap.get(ip) || { count: 0, windowStart: now };
  if (now - e.windowStart > 60000) { e.count = 0; e.windowStart = now; }
  e.count++;
  rateMap.set(ip, e);
  return e.count > 120;
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const origin = req.headers.origin;
  const corsH = cors(origin);
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsH); return res.end();
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, corsH); return res.end("Method not allowed");
  }
  const target = reqUrl.searchParams.get("url");
  if (!target) { res.writeHead(400, corsH); return res.end("Missing ?url"); }
  let targetUrl;
  try { targetUrl = new URL(target); }
  catch { res.writeHead(400, corsH); return res.end("Invalid url"); }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    res.writeHead(403, corsH); return res.end("Blocked: non-http(s)");
  }
  if (isPrivateHost(targetUrl.hostname)) {
    res.writeHead(403, corsH); return res.end("Blocked: private IP");
  }
  const ip = req.socket.remoteAddress || "anonymous";
  if (rateLimited(ip)) { res.writeHead(429, corsH); return res.end("Rate limit exceeded"); }
  targetUrl.username = ""; targetUrl.password = "";

  const lib = targetUrl.protocol === "https:" ? request : httpRequest;
  const upstream = lib({
    method: req.method,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    headers: {
      "User-Agent": reqUrl.searchParams.get("ua") || DEFAULT_UA,
      ...(reqUrl.searchParams.get("ref") ? { "Referer": reqUrl.searchParams.get("ref") } : {}),
    },
    timeout: 60000,
  }, (up) => {
    const h = { ...corsH };
    const ct = up.headers["content-type"];
    if (ct) h["Content-Type"] = ct;
    res.writeHead(up.statusCode || 502, h);
    up.pipe(res);
  });
  upstream.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502, corsH);
    res.end("Upstream error: " + (e?.message || "unknown"));
  });
  upstream.on("timeout", () => {
    upstream.destroy(new Error("timeout"));
  });
});
server.listen(PORT, () => console.log(`streamline-proxy on :${PORT}`));
```

**`Dockerfile`**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.js"]
```

**`docker-compose.yml`**
```yaml
services:
  streamline-proxy:
    build: .
    ports:
      - "8787:8787"
    environment:
      - PORT=8787
      - ALLOWED_ORIGINS=https://your-app.example.com
    restart: unless-stopped
```

Run with `docker compose up --build`, then point `PROXY_URL` at `https://proxy.example.com:8787`.

### Option C — Bundled Next.js route

Streamline ships a built-in `/api/proxy` route (`src/app/api/proxy/route.ts`) that mirrors the Cloudflare Worker logic for self-hosted Next.js deployments (Vercel, Docker, Node standalone). It is the simplest path for development and small-scale use; for heavy production traffic prefer Option A (Cloudflare) for its global edge caching and DDoS protection.

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `F` | Toggle fullscreen |
| `M` | Mute / unmute |
| `↑` / `↓` | Volume up / down |
| `←` / `→` | Seek -10s / +10s (VOD) or zap prev / next (live) |
| `G` | Open the Guide (EPG) view |
| `/` | Focus the search bar |
| `0`–`9` | Seek to 0 % / 10 % / … / 90 % (VOD) |
| `N` | Next channel in queue |
| `P` | Previous channel in queue |
| `I` | Toggle the info overlay (now / next + stats) |
| `C` | Toggle the channel list rail |
| `T` | Toggle theme (dark / light / system) |
| `?` | Show keyboard help overlay |

---

## Troubleshooting

### CORS errors when loading a playlist or stream
The browser console shows `Access-Control-Allow-Origin` errors and the network request is shown as failed (CORS). Causes:
- The M3U host does not return CORS headers.
- The page is HTTPS but the stream URL is HTTP (see *Mixed content* below).

**Fix**: deploy and enable the CORS proxy (see [CORS proxy deployment](#cors-proxy-deployment)), then toggle **Settings → Network → Use proxy**. The proxy rewrites the stream URL to `https://your-proxy/?url=<encoded>` and injects `Access-Control-Allow-Origin: *`.

### Mixed content — HTTPS page loading an HTTP stream
The browser blocks `http://` subresource loads from an `https://` page. Console error looks like `Mixed Content: ... was loaded over HTTPS, but requested an insecure resource`.

**Fix**: route the stream through the proxy — the browser will fetch `https://your-proxy/?url=http://...` which is itself HTTPS, satisfying the mixed-content rule. Alternatively, host the player on HTTP (not recommended; breaks service workers and PWA install).

### hls.js fatal errors
A toast or overlay says `HLS: networkError manifestLoadError` (or similar). Causes:
- The manifest URL is wrong, expired, or geo-blocked.
- CORS is blocking the manifest.
- The host rate-limits your IP.

**Fix**: open the failing URL directly in a browser tab. If it 404s, the URL is dead; if it loads, the issue is CORS — enable the proxy. If you see intermittent `fragLoadError`, bump **Settings → Player → Buffer seconds** to 20+ and enable the proxy for stability.

### mpegts.js not supported
Some browsers (notably iOS Safari) cannot run mpegts.js and have no native `.ts`/`.flv` support. Streamline will throw `MPEG-TS playback not supported`. **Fix**: pick a different source that exposes `.m3u8` (HLS), which iOS Safari plays natively.

### EPG not loading
If the Guide view is empty:
- Confirm the playlist's channels have `tvg-id` attributes. Without them, EPG programmes cannot be matched.
- Confirm the EPG URL is reachable and returns XMLTV. Enable the proxy if it is cross-origin.
- EPG data is refreshed daily; you can force a refresh from **Settings → EPG → Refresh now**.

### Large playlists are slow
For >10 000-channel playlists:
- Parsing still happens in a Web Worker, but the channel grid uses virtualization — make sure you have **not** disabled TanStack Virtual.
- If favorites / search feel slow, run **Settings → Maintenance → Rebuild indexes**. This compacts the IndexedDB channels table and rebuilds Fuse.js indices.
- Use group filtering to keep the rendered set small.

---

## Legal & content policy

Streamline is a **player only**. It:
- ships with **no channels, no playlists, no streams, no EPG data** of its own;
- contains **no** sample copyrighted content — the bundled demo playlist uses exclusively publicly-available, royalty-free HLS test streams (Big Buck Bunny, Sintel, Tears of Steel from the Blender Foundation; Apple BipBop sample streams; Mux test streams);
- does not host, proxy (in the sense of mirroring), or redistribute any third-party content — the optional CORS proxy is a transparent pass-through that fetches one URL per client request and never stores the response;
- does not include any mechanism to discover, list, or install "free IPTV" playlists.

By using Streamline you agree to add **only** content you have the legal right to access — your own subscription, your own self-hosted media, public-domain test streams, or content licensed for redistribution. The authors of Streamline are not responsible for what you choose to view.

---

## Project structure

```
.
├── public/
│   ├── logo.svg                  # Brand mark (referenced by manifest + layout)
│   ├── manifest.webmanifest      # PWA manifest
│   └── sw.js                     # Cache-first service worker (streams bypass)
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout, fonts, metadata, viewport
│   │   ├── page.tsx              # App entry — mounts the IPTV shell
│   │   ├── globals.css           # Design tokens (dark-first cinematic theme)
│   │   └── api/
│   │       ├── route.ts          # Health-check endpoint
│   │       └── proxy/route.ts    # CORS proxy route handler (anti-SSRF)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives
│   │   └── iptv/
│   │       ├── sidebar.tsx       # Desktop nav + mobile tab bar
│   │       ├── topbar.tsx        # Search + actions
│   │       ├── onboarding-wizard.tsx
│   │       ├── channel-logo.tsx
│   │       ├── theme-provider.tsx
│   │       └── register-sw.tsx  # Service worker registration (client-only)
│   ├── lib/
│   │   ├── db.ts                 # Dexie database singleton
│   │   ├── utils.ts              # cn() helper
│   │   └── iptv/
│   │       ├── types.ts          # Domain types (Playlist, Channel, EPG, …)
│   │       ├── db.ts             # Dexie schema + helpers
│   │       ├── store.ts          # Zustand store (view, player, favorites, …)
│   │       ├── m3u-parser.ts     # M3U parser (worker-friendly)
│   │       ├── xmltv-parser.ts   # XMLTV parser
│   │       ├── player-engine.ts  # hls.js / mpegts.js / native abstraction
│   │       ├── search.ts         # Fuse.js fuzzy search
│   │       ├── sanitize.ts       # Input sanitization
│   │       ├── hooks.ts          # TanStack Query hooks
│   │       └── demo.ts          # Legal demo playlist
│   ├── workers/
│   │   └── m3u.worker.ts         # Off-main-thread M3U fetch + parse
│   └── hooks/
│       ├── use-mobile.ts
│       └── use-toast.ts
├── next.config.ts                # standalone output
├── tailwind.config.ts
├── components.json               # shadcn config
└── package.json
```

---

## Roadmap

- **Xtream Codes series & VOD** — full Live / VOD / Series tabs with episode metadata, season posters, and resume positions.
- **Multi-view** — 2×2 and 3×3 grid of simultaneously-playing channels for sports monitoring.
- **Casting** — Chromecast / AirPlay / DLNA render targets.
- **Parental PIN** — per-profile lock for sensitive groups or rated content.
- **i18n with RTL** — Arabic / Hebrew layouts, language packs loaded on demand.

---

## License

MIT © Streamline contributors. See [LICENSE](./LICENSE) for details.
