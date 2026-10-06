// Xtream Codes API integration
// Connects to any standard Xtream Codes IPTV provider (player_api.php)
// to fetch Live Streams, VOD (Movies), and Series with categorization and EPG.

import type { Channel, ParsedStreamResult } from "./types";
import { sanitizeText, sanitizeUrl } from "./sanitize";

export interface XtreamCredentials {
  server: string;
  username: string;
  password: string;
}

export interface XtreamUserInfo {
  username: string;
  status: string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export interface XtreamServerInfo {
  url: string;
  port: string;
  https_port: string;
  server_protocol: string;
  rtmp_port: string;
  timezone: string;
  time_now: string;
}

export interface XtreamAuthResponse {
  user_info: XtreamUserInfo;
  server_info: XtreamServerInfo;
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id?: number;
}

export interface XtreamLiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon?: string;
  epg_channel_id?: string;
  added?: string;
  category_id: string;
  custom_sid?: string;
  tv_archive?: number;
  direct_source?: string;
}

export interface XtreamVodStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon?: string;
  rating?: string;
  rating_5based?: number;
  added?: string;
  category_id: string;
  container_extension?: string;
  custom_sid?: string;
  direct_source?: string;
}

export interface XtreamSeries {
  num: number;
  name: string;
  series_id: number;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  last_modified?: string;
  rating?: string;
  rating_5based?: number;
  backdrop_path?: string[];
  youtube_trailer?: string;
  episode_run_time?: string;
  category_id: string;
}

/** Normalize server URL to have protocol and no trailing slash. */
export function normalizeServerUrl(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) {
    s = "http://" + s;
  }
  return s.replace(/\/+$/, "");
}

/** Fetch a URL with automatic fallback to local CORS proxy. */
async function fetchWithProxyFallback(targetUrl: string): Promise<Response> {
  try {
    const res = await fetch(targetUrl);
    if (res.ok) return res;
  } catch {
    // CORS or network failure, fall through to proxy
  }

  // Fallback to local /api/proxy
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  return fetch(proxyUrl);
}

/** Fetch and parse JSON with proxy fallback. */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithProxyFallback(url);
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Authenticate with Xtream server and return account metadata. */
export async function authenticateXtream(
  creds: XtreamCredentials,
): Promise<XtreamAuthResponse> {
  const base = normalizeServerUrl(creds.server);
  if (!base) throw new Error("Invalid server URL.");
  if (!creds.username || !creds.password) {
    throw new Error("Username and password are required.");
  }

  const authUrl = `${base}/player_api.php?username=${encodeURIComponent(
    creds.username,
  )}&password=${encodeURIComponent(creds.password)}`;

  const data = await fetchJson<any>(authUrl);

  if (!data || typeof data !== "object") {
    throw new Error("Invalid response from Xtream server.");
  }

  if (data.user_info && data.user_info.auth === 0) {
    throw new Error("Xtream Authentication failed: Invalid username or password.");
  }

  if (data.user_info?.status && data.user_info.status.toLowerCase() === "disabled") {
    throw new Error("Xtream account is disabled or expired.");
  }

  return data as XtreamAuthResponse;
}

export interface ImportXtreamOptions {
  includeLive?: boolean;
  includeVod?: boolean;
  includeSeries?: boolean;
  liveOutputFormat?: "m3u8" | "ts";
  onProgress?: (message: string, count: number) => void;
}

/** Fetch all requested streams and build Channel entities. */
export async function importXtreamContent(
  creds: XtreamCredentials,
  playlistId: string,
  options: ImportXtreamOptions = {},
): Promise<ParsedStreamResult> {
  const {
    includeLive = true,
    includeVod = true,
    includeSeries = true,
    liveOutputFormat = "m3u8",
    onProgress,
  } = options;

  const base = normalizeServerUrl(creds.server);
  const u = encodeURIComponent(creds.username);
  const p = encodeURIComponent(creds.password);
  const apiUrl = (action: string) =>
    `${base}/player_api.php?username=${u}&password=${p}&action=${action}`;

  const allChannels: Channel[] = [];
  const groupSet = new Set<string>();

  // 1. Live TV
  if (includeLive) {
    onProgress?.("Fetching Live TV categories…", allChannels.length);
    let liveCats: XtreamCategory[] = [];
    try {
      liveCats = await fetchJson<XtreamCategory[]>(apiUrl("get_live_categories"));
    } catch {
      liveCats = [];
    }

    const catMap = new Map<string, string>();
    liveCats.forEach((c) => {
      catMap.set(String(c.category_id), sanitizeText(c.category_name));
    });

    onProgress?.("Fetching Live TV streams…", allChannels.length);
    let streams: XtreamLiveStream[] = [];
    try {
      streams = await fetchJson<XtreamLiveStream[]>(apiUrl("get_live_streams"));
    } catch {
      streams = [];
    }

    streams.forEach((s) => {
      const catName = catMap.get(String(s.category_id)) || "Live TV";
      const group = catName ? `Live: ${catName}` : "Live TV";
      groupSet.add(group);

      const streamExt = liveOutputFormat === "ts" ? "ts" : "m3u8";
      const streamUrl = `${base}/live/${creds.username}/${creds.password}/${s.stream_id}.${streamExt}`;

      allChannels.push({
        id: `${playlistId}:live:${s.stream_id}`,
        playlistId,
        number: s.num ? String(s.num) : undefined,
        name: sanitizeText(s.name),
        logo: s.stream_icon ? sanitizeUrl(s.stream_icon) : undefined,
        group,
        tvgId: s.epg_channel_id ? sanitizeText(s.epg_channel_id, 200) : undefined,
        tvgName: sanitizeText(s.name, 200),
        url: streamUrl,
      });
    });
  }

  // 2. VOD / Movies
  if (includeVod) {
    onProgress?.("Fetching Movies categories…", allChannels.length);
    let vodCats: XtreamCategory[] = [];
    try {
      vodCats = await fetchJson<XtreamCategory[]>(apiUrl("get_vod_categories"));
    } catch {
      vodCats = [];
    }

    const vodCatMap = new Map<string, string>();
    vodCats.forEach((c) => {
      vodCatMap.set(String(c.category_id), sanitizeText(c.category_name));
    });

    onProgress?.("Fetching Movies catalog…", allChannels.length);
    let vodStreams: XtreamVodStream[] = [];
    try {
      vodStreams = await fetchJson<XtreamVodStream[]>(apiUrl("get_vod_streams"));
    } catch {
      vodStreams = [];
    }

    vodStreams.forEach((s) => {
      const catName = vodCatMap.get(String(s.category_id)) || "Movies";
      const group = catName ? `Movies: ${catName}` : "Movies";
      groupSet.add(group);

      const ext = s.container_extension || "mp4";
      const streamUrl = `${base}/movie/${creds.username}/${creds.password}/${s.stream_id}.${ext}`;

      allChannels.push({
        id: `${playlistId}:vod:${s.stream_id}`,
        playlistId,
        number: s.num ? String(s.num) : undefined,
        name: sanitizeText(s.name),
        logo: s.stream_icon ? sanitizeUrl(s.stream_icon) : undefined,
        group,
        url: streamUrl,
        quality: s.name.match(/\b(4k|2160p|1080p|720p|hd|fhd)\b/i)?.[1]?.toUpperCase(),
      });
    });
  }

  // 3. Series
  if (includeSeries) {
    onProgress?.("Fetching TV Series categories…", allChannels.length);
    let seriesCats: XtreamCategory[] = [];
    try {
      seriesCats = await fetchJson<XtreamCategory[]>(apiUrl("get_series_categories"));
    } catch {
      seriesCats = [];
    }

    const seriesCatMap = new Map<string, string>();
    seriesCats.forEach((c) => {
      seriesCatMap.set(String(c.category_id), sanitizeText(c.category_name));
    });

    onProgress?.("Fetching TV Series list…", allChannels.length);
    let seriesList: XtreamSeries[] = [];
    try {
      seriesList = await fetchJson<XtreamSeries[]>(apiUrl("get_series"));
    } catch {
      seriesList = [];
    }

    seriesList.forEach((s) => {
      const catName = seriesCatMap.get(String(s.category_id)) || "Series";
      const group = catName ? `Series: ${catName}` : "Series";
      groupSet.add(group);

      // Xtream series streams can be accessed directly or via episodes
      const streamUrl = `${base}/series/${creds.username}/${creds.password}/${s.series_id}.mp4`;

      allChannels.push({
        id: `${playlistId}:series:${s.series_id}`,
        playlistId,
        number: s.num ? String(s.num) : undefined,
        name: sanitizeText(s.name),
        logo: s.cover ? sanitizeUrl(s.cover) : undefined,
        group,
        url: streamUrl,
      });
    });
  }

  return {
    channels: allChannels,
    groups: Array.from(groupSet).sort(),
    count: allChannels.length,
  };
}

/** Get standard XMLTV URL for an Xtream source. */
export function getXtreamXmltvUrl(creds: XtreamCredentials): string {
  const base = normalizeServerUrl(creds.server);
  return `${base}/xmltv.php?username=${encodeURIComponent(
    creds.username,
  )}&password=${encodeURIComponent(creds.password)}`;
}
