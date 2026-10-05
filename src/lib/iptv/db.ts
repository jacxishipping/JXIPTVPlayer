import Dexie, { type Table } from "dexie";
import type {
  Channel,
  EpgProgramme,
  FavoriteList,
  HistoryEntry,
  Playlist,
  Profile,
  Settings,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  theme: "dark",
  accent: "oklch(0.65 0.24 18)",
  language: "en",
  defaultEngine: "auto",
  bufferSeconds: 12,
  proxyEnabled: false,
  reducedMotion: false,
  autoHideControls: true,
  autoplayNext: true,
};

class IptvDatabase extends Dexie {
  playlists!: Table<Playlist, string>;
  channels!: Table<Channel, string>;
  favorites!: Table<FavoriteList, string>;
  history!: Table<HistoryEntry, string>;
  settings!: Table<Settings, string>;
  epg!: Table<EpgProgramme, string>;
  profiles!: Table<Profile, string>;

  constructor() {
    super("streamline-iptv");
    this.version(1).stores({
      playlists: "id, type, addedAt",
      channels: "id, playlistId, group, name, tvgId, hidden",
      favorites: "id, name, createdAt",
      history: "id, playlistId, watchedAt",
      settings: "id",
      epg: "id, tvgId, start, stop",
      profiles: "id, name",
    });
  }
}

// Lazy-init on client to avoid SSR access.
let _db: IptvDatabase | null = null;
export function getDb(): IptvDatabase {
  if (typeof window === "undefined") {
    throw new Error("Dexie database can only be used in the browser.");
  }
  if (!_db) _db = new IptvDatabase();
  return _db;
}

export async function loadSettings(): Promise<Settings> {
  const db = getDb();
  const s = await db.settings.get("settings");
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = getDb();
  const current = await loadSettings();
  const next = { ...current, ...patch, id: "settings" as const };
  await db.settings.put(next);
  return next;
}

/** Count channels for a playlist without loading all rows. */
export async function countChannelsFor(playlistId: string): Promise<number> {
  const db = getDb();
  return db.channels.where("playlistId").equals(playlistId).count();
}

/** Bulk replace all channels for a playlist in a single transaction. */
export async function replacePlaylistChannels(
  playlistId: string,
  channels: Channel[],
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.channels, async () => {
    await db.channels.where("playlistId").equals(playlistId).delete();
    if (channels.length) await db.channels.bulkPut(channels);
  });
}

export async function clearAll(): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.playlists, db.channels, db.favorites, db.history, db.epg, db.profiles],
    async () => {
      await Promise.all([
        db.playlists.clear(),
        db.channels.clear(),
        db.favorites.clear(),
        db.history.clear(),
        db.epg.clear(),
        db.profiles.clear(),
      ]);
    },
  );
}
