// M3U parser logic — kept framework-agnostic so it can run both on the main
// thread (for small text pastes) and inside a Web Worker (for large URLs).
//
// Supports #EXTINF attributes: tvg-id, tvg-name, tvg-logo, group-title,
// catchup, catchup-source. Also supports #EXTVLCOPT:http-user-agent=...
// and #KODIPROP:inputstream.adaptive.license_key=... style overrides.

import type { Channel, ParsedStreamResult } from "./types";
import { sanitizeText, sanitizeUrl } from "./sanitize";

const QUALITY_RE = /\b(4K|2160p|1080p|720p|HD|FHD|UHD|SD)\b/i;
const LANG_HINT: Array<[RegExp, string]> = [
  [/\b(ENG|ENGLISH|EN)\b/i, "EN"],
  [/\b(ESP|SPANISH|ES)\b/i, "ES"],
  [/\b(FRA|FRENCH|FR)\b/i, "FR"],
  [/\b(DEU|GERMAN|DE)\b/i, "DE"],
  [/\b(ITA|ITALIAN|IT)\b/i, "IT"],
  [/\b(POR|PORTUGUESE|PT|BR)\b/i, "PT"],
  [/\b(RUS|RUSSIAN|RU)\b/i, "RU"],
  [/\b(ARA|ARABIC|AR)\b/i, "AR"],
  [/\b(CHN|CHINESE|ZH|CN)\b/i, "ZH"],
  [/\b(JPN|JAPANESE|JA|JP)\b/i, "JA"],
  [/\b(HIN|HINDI|HI)\b/i, "HI"],
  [/\b(KOR|KOREAN|KO)\b/i, "KO"],
  [/\b(TUR|TURKISH|TR)\b/i, "TR"],
];

function parseAttrs(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match key="value" pairs
  const re = /([a-zA-Z0-9_-]+)="((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    attrs[m[1].toLowerCase()] = m[2].replace(/\\"/g, '"');
  }
  // Also catch unquoted trailing catchup="..." but some lists use catchup=default without quotes
  return attrs;
}

export function parseM3U(
  raw: string,
  playlistId: string,
  onProgress?: (processed: number) => void,
): ParsedStreamResult {
  const channels: Channel[] = [];
  const groupSet = new Set<string>();

  // Normalize line endings
  const text = raw.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  let pendingInf: {
    attrs: Record<string, string>;
    name: string;
    userAgent?: string;
    referrer?: string;
  } | null = null;

  let reportEvery = Math.max(1, Math.floor(lines.length / 50));
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXTM3U")) continue;

    // VLC option lines come AFTER #EXTINF and BEFORE the URL.
    // We stash them on the pending info.
    if (line.startsWith("#EXTVLCOPT:") || line.startsWith("#EXTVLCOPT-")) {
      const opt = line.slice(line.indexOf(":") + 1);
      const [key, ...rest] = opt.split("=");
      const value = rest.join("=");
      if (!pendingInf) pendingInf = { attrs: {}, name: "" };
      const lk = key.toLowerCase();
      if (lk === "http-user-agent") pendingInf.userAgent = value;
      else if (lk === "http-referrer") pendingInf.referrer = value;
      continue;
    }
    if (line.startsWith("#KODIPROP:")) {
      const opt = line.slice("#KODIPROP:".length);
      const [key, ...rest] = opt.split("=");
      const value = rest.join("=");
      if (!pendingInf) pendingInf = { attrs: {}, name: "" };
      if (key.toLowerCase() === "http-user-agent") pendingInf.userAgent = value;
      else if (key.toLowerCase() === "http-referrer") pendingInf.referrer = value;
      continue;
    }

    if (line.startsWith("#EXTINF")) {
      const commaIdx = line.indexOf(",");
      const attrPart = commaIdx >= 0 ? line.slice(0, commaIdx) : line;
      const namePart = commaIdx >= 0 ? line.slice(commaIdx + 1) : "";
      pendingInf = {
        attrs: parseAttrs(attrPart),
        name: namePart,
        userAgent: undefined,
        referrer: undefined,
      };
      continue;
    }

    // Skip other directives
    if (line.startsWith("#")) continue;

    // It's a URL line
    const url = sanitizeUrl(line);
    if (!url || !pendingInf) {
      pendingInf = null;
      continue;
    }

    const name = sanitizeText(pendingInf.name) || "Untitled";
    const group = pendingInf.attrs["group-title"]
      ? sanitizeText(pendingInf.attrs["group-title"])
      : "All Channels";
    groupSet.add(group);

    const qualityMatch = name.match(QUALITY_RE);
    let lang: string | undefined;
    for (const [re, code] of LANG_HINT) {
      if (re.test(name) || re.test(group)) {
        lang = code;
        break;
      }
    }

    const channel: Channel = {
      id: `${playlistId}:${count}`,
      playlistId,
      number: pendingInf.attrs["tvg-channel"] || pendingInf.attrs["channel-number"],
      name,
      logo: pendingInf.attrs["tvg-logo"] ? sanitizeUrl(pendingInf.attrs["tvg-logo"]) : undefined,
      group,
      tvgId: pendingInf.attrs["tvg-id"] ? sanitizeText(pendingInf.attrs["tvg-id"], 200) : undefined,
      tvgName: pendingInf.attrs["tvg-name"] ? sanitizeText(pendingInf.attrs["tvg-name"], 200) : name,
      url,
      catchup: pendingInf.attrs["catchup"] || undefined,
      catchupSource: pendingInf.attrs["catchup-source"]
        ? sanitizeUrl(pendingInf.attrs["catchup-source"])
        : undefined,
      userAgent: pendingInf.userAgent,
      referrer: pendingInf.referrer,
      language: lang,
      quality: qualityMatch ? qualityMatch[1].toUpperCase() : undefined,
    };
    channels.push(channel);
    count++;

    if (count % reportEvery === 0 && onProgress) onProgress(count);

    pendingInf = null;
  }

  return { channels, groups: Array.from(groupSet).sort(), count: channels.length };
}
