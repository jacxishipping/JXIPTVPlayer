// Lightweight XMLTV parser. Handles the subset we need: channel display-name,
// logo, and programme title/desc/start/stop/category. Runs on main thread
// using DOMParser (small enough for typical EPG files; for huge EPGs we could
// stream, but DOMParser is fine for tens of thousands of programmes).

import type { EpgProgramme } from "./types";
import { sanitizeText } from "./sanitize";

function parseXmltvDate(s: string): number {
  // Format: 20240101120000 +0200  or  2024-01-01T12:00:00Z
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4})|Z)?$/.exec(s.trim());
  if (m) {
    const [, y, mo, d, h, mi, se, tz] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}${tz ? tz.slice(0, 3) + ":" + tz.slice(3) : "Z"}`;
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return t;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

export interface ParsedEpg {
  programmes: EpgProgramme[];
  channels: { tvgId: string; name: string; logo?: string }[];
}

export function parseXmltv(xml: string): ParsedEpg {
  const programmes: EpgProgramme[] = [];
  const channels: ParsedEpg["channels"] = [];

  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const errNode = doc.querySelector("parsererror");
  if (errNode) throw new Error("Invalid XMLTV document");

  const channelNodes = doc.querySelectorAll("channel");
  channelNodes.forEach((c) => {
    const id = c.getAttribute("id") || "";
    const displayName = c.querySelector("display-name")?.textContent || id;
    const logo = c.querySelector("icon")?.getAttribute("src") || undefined;
    channels.push({
      tvgId: sanitizeText(id, 200),
      name: sanitizeText(displayName),
      logo: logo || undefined,
    });
  });

  const progNodes = doc.querySelectorAll("programme");
  progNodes.forEach((p) => {
    const tvgId = p.getAttribute("channel") || "";
    const start = parseXmltvDate(p.getAttribute("start") || "");
    const stop = parseXmltvDate(p.getAttribute("stop") || "");
    const title = p.querySelector("title")?.textContent || "";
    const desc = p.querySelector("desc")?.textContent || undefined;
    const subtitle = p.querySelector("sub-title")?.textContent || undefined;
    const category = p.querySelector("category")?.textContent || undefined;
    if (!tvgId || !start || !stop || !title) return;
    programmes.push({
      id: `${tvgId}:${start}`,
      tvgId,
      start,
      stop,
      title: sanitizeText(title),
      desc: desc ? sanitizeText(desc) : undefined,
      subtitle: subtitle ? sanitizeText(subtitle) : undefined,
      category: category ? sanitizeText(category) : undefined,
    });
  });

  return { programmes, channels };
}
