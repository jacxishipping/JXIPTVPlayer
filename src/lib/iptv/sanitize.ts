// XSS-safe text sanitization for playlist/EPG content.
// Playlists and XMLTV come from untrusted user-supplied sources and may contain
// HTML/JS. We strip all tags and control characters, and cap length.

const MAX_LEN = 2000;

/** Strip HTML tags and dangerous characters from a string. */
export function sanitizeText(input: unknown, maxLen = MAX_LEN): string {
  if (typeof input !== "string") return "";
  let s = input;
  // Remove HTML tags
  s = s.replace(/<[^>]*>/g, "");
  // Decode a few common entities to keep readability
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  // Remove control chars except whitespace
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/** Validate and normalize a URL; returns undefined if invalid or points to private IP (SSRF guard). */
export function safePublicUrl(raw: string): URL | undefined {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return undefined;
    const host = u.hostname.toLowerCase();
    // Block private/loopback ranges for the proxy
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^::1$/.test(host) ||
      /^fe[89a-f]/.test(host)
    ) {
      return undefined;
    }
    return u;
  } catch {
    return undefined;
  }
}

/** Sanitize a URL string for storage/display (no SSRF guard — used client-side). */
export function sanitizeUrl(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return "";
  try {
    const u = new URL(trimmed);
    // Force https/http only
    return u.toString();
  } catch {
    return "";
  }
}
