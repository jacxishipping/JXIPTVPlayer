// Core domain types for the Streamline IPTV player.

export type SourceType = "m3u-url" | "m3u-file" | "xtream" | "text";

export interface Playlist {
  id: string;
  name: string;
  type: SourceType;
  /** Source URL for m3u-url / xtream */
  url?: string;
  /** Encrypted credentials blob (Xtream user/pass). Base64 of JSON. */
  credentials?: string;
  /** Channel count cached for the switcher */
  channelCount: number;
  addedAt: number;
  lastRefreshedAt: number;
  /** Auto-refresh interval in minutes, 0 = off */
  autoRefresh?: number;
}

export interface Channel {
  /** Composite id: `${playlistId}:${index}` to remain stable across refreshes */
  id: string;
  playlistId: string;
  /** Optional assigned channel number */
  number?: string;
  name: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
  url: string;
  /** catchup type e.g. "default", "shift", "append" */
  catchup?: string;
  catchupSource?: string;
  /** per-channel overrides from EXTVLCOPT/KODIPROP */
  userAgent?: string;
  referrer?: string;
  hidden?: boolean;
  /** language code hint parsed from group/name */
  language?: string;
  /** quality hint parsed from name (HD/4K/720) */
  quality?: string;
}

export interface FavoriteList {
  id: string;
  name: string;
  createdAt: number;
  channelIds: string[];
}

export interface HistoryEntry {
  id: string; // channelId
  playlistId: string;
  channelName: string;
  channelLogo?: string;
  watchedAt: number;
  position?: number;
  duration?: number;
}

export interface Settings {
  id: "settings";
  theme: "dark" | "light" | "system";
  accent: string;
  language: string;
  defaultEngine: "auto" | "hls" | "mpegts" | "native";
  bufferSeconds: number;
  proxyEnabled: boolean;
  proxyUrl?: string;
  reducedMotion: boolean;
  autoHideControls: boolean;
  autoplayNext: boolean;
  parentalPin?: string;
}

export interface EpgProgramme {
  id: string; // `${tvgId}:${start}`
  tvgId: string;
  start: number;
  stop: number;
  title: string;
  desc?: string;
  category?: string;
  subtitle?: string;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export type MediaType = "live" | "movie" | "series";

export interface ParsedStreamResult {
  channels: Channel[];
  groups: string[];
  count: number;
}
