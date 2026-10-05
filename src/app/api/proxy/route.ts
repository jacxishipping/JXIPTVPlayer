/**
 * Streamline CORS proxy — Next.js Route Handler (Node / Vercel runtime).
 *
 * Usage:
 *   GET /api/proxy?url=<encoded>&ua=<encoded UA>&ref=<encoded Referer>
 *
 * Behavior:
 *   - Forwards the request to the target URL using global `fetch`.
 *   - Blocks private / loopback / link-local / ULA hosts (anti-SSRF).
 *   - Passes through optional `ua` (User-Agent) and `ref` (Referer) overrides.
 *   - Sets permissive CORS headers (`Access-Control-Allow-Origin: *`).
 *   - Streams the upstream response body back with the original Content-Type.
 *   - Enforces a 60-second timeout via `AbortController`.
 *   - Handles OPTIONS preflight.
 *
 * Security:
 *   - This route MUST NOT log query URLs — they may embed credentials
 *     (Xtream user/pass in path) or session tokens.
 *   - The target host is validated against private IP ranges to prevent
 *     the proxy from being used as an SSRF relay against internal services.
 */

import { NextRequest, NextResponse } from "next/server";

// Force the Node runtime (we rely on streaming + AbortController behavior).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const UPSTREAM_TIMEOUT_MS = 60_000;

// Headers we copy from the upstream response to our response.
const PASSTHROUGH_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "etag",
  "last-modified",
  "age",
  "date",
  "expires",
  "vary",
]);

/**
 * Returns true if the host looks like a private / loopback / link-local /
 * unique-local address that we must refuse to proxy to (anti-SSRF).
 */
function isPrivateHost(host: string): boolean {
  // Strip bracket notation for IPv6.
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();

  // IPv4 dotted-quad.
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (
      Number.isNaN(a) ||
      Number.isNaN(b) ||
      a > 255 ||
      b > 255 ||
      Number(v4[3]) > 255 ||
      Number(v4[4]) > 255
    ) {
      return true; // not a valid IP — treat as unsafe
    }
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a >= 224) return true; // multicast 224.0.0.0/4 + reserved
  }

  // IPv6 special addresses.
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(h)) return true; // link-local fe80::/10
  if (h.startsWith("ff")) return true; // multicast ff00::/8
  if (h.endsWith(".localhost") || h === "localhost") return true;

  // Cloud metadata endpoints — explicit, defense-in-depth.
  if (h === "169.254.169.254" || h.includes("metadata.google.internal")) {
    return true;
  }

  return false;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

function badRequest(message: string) {
  return new NextResponse(message, { status: 400, headers: corsHeaders });
}

function forbidden(message: string) {
  return new NextResponse(message, { status: 403, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const target = sp.get("url");
  if (!target) return badRequest("Missing ?url parameter");

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return badRequest("Invalid url parameter");
  }

  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return forbidden("Blocked: non-http(s) scheme");
  }

  if (isPrivateHost(targetUrl.hostname)) {
    return forbidden("Blocked: private IP");
  }

  // Strip credentials from the URL — they will be re-sent as headers only
  // if explicitly requested via `ua` / `ref`. We never pass through basic
  // auth embedded in the URL because that would log them in upstream logs.
  targetUrl.username = "";
  targetUrl.password = "";

  // Build upstream headers.
  const upstreamHeaders = new Headers();
  const ua = sp.get("ua");
  const ref = sp.get("ref");
  upstreamHeaders.set("User-Agent", ua || DEFAULT_UA);
  if (ref) {
    try {
      // Validate the Referer is a real URL.
      new URL(ref);
      upstreamHeaders.set("Referer", ref);
    } catch {
      // ignore malformed referer
    }
  }
  // Pass through the client's Accept / Range (helps with media segment fetches).
  const accept = req.headers.get("accept");
  if (accept) upstreamHeaders.set("Accept", accept);
  const range = req.headers.get("range");
  if (range) upstreamHeaders.set("Range", range);

  // AbortController for the 60-second timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: upstreamHeaders,
      signal: controller.signal,
      redirect: "follow",
      // Don't send credentials — we are an open CORS proxy.
      credentials: "omit",
    });

    const respHeaders = new Headers(corsHeaders);
    upstream.headers.forEach((value, key) => {
      if (PASSTHROUGH_RESPONSE_HEADERS.has(key.toLowerCase())) {
        respHeaders.set(key, value);
      }
    });

    // Stream the body straight through. `upstream.body` is a ReadableStream
    // in the Node runtime via global fetch (undici).
    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    const aborted =
      err instanceof DOMException &&
      (err.name === "AbortError" || err.name === "TimeoutError");
    return new NextResponse(
      aborted ? "Upstream timeout" : "Upstream fetch failed",
      { status: aborted ? 504 : 502, headers: corsHeaders },
    );
  } finally {
    clearTimeout(timer);
  }
}

// HEAD shares the same logic — let Next.js route it the same way.
export const HEAD = GET;
