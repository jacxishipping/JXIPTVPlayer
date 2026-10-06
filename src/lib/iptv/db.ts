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
  try {
    // Attempt local load first for zero-latency UI
    const db = getDb();
    const s = await db.settings.get("settings");
    if (s) return { ...DEFAULT_SETTINGS, ...s };
  } catch {}

  // Fallback to server database
  try {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const serverSettings = await res.json();
      return { ...DEFAULT_SETTINGS, ...serverSettings };
    }
  } catch {}

  return DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current, ...patch, id: "settings" as const };
  try {
    const db = getDb();
    await db.settings.put(next);
  } catch (e) {
    console.warn("Could not save settings to local database:", e);
  }

  // Persist to server database
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
  } catch (e) {
    console.warn("Could not save settings to server database:", e);
  }

  return next;
}

/** Save playlist to local Dexie and server database */
export async function savePlaylist(playlist: Playlist): Promise<void> {
  const db = getDb();
  await db.playlists.put(playlist);

  try {
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(playlist),
    });
  } catch (e) {
    console.warn("Could not sync playlist to server:", e);
  }
}

/** Delete playlist from local Dexie and server database */
export async function deletePlaylist(id: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", [db.playlists, db.channels], async () => {
    await db.playlists.delete(id);
    await db.channels.where("playlistId").equals(id).delete();
  });

  try {
    await fetch(`/api/playlists?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  } catch (e) {
    console.warn("Could not delete playlist from server:", e);
  }
}

/** Sync playlists between local IndexedDB and server SQLite database */
export async function syncPlaylistsWithServer(): Promise<Playlist[]> {
  const db = getDb();
  let localPlaylists: Playlist[] = [];
  try {
    localPlaylists = await db.playlists.toArray();
  } catch {}

  let serverPlaylists: Playlist[] = [];
  try {
    const res = await fetch("/api/playlists");
    if (res.ok) {
      serverPlaylists = await res.json();
    }
  } catch {}

  // Sync server playlists to local
  if (serverPlaylists.length > 0) {
    try {
      await db.playlists.bulkPut(serverPlaylists);
    } catch {}
  }

  // Sync local playlists to server if missing
  const serverIds = new Set(serverPlaylists.map((p) => p.id));
  for (const p of localPlaylists) {
    if (!serverIds.has(p.id)) {
      try {
        await fetch("/api/playlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        });
      } catch {}
    }
  }

  const all = await db.playlists.toArray();
  all.sort((a, b) => a.addedAt - b.addedAt);
  return all;
}

/** Count channels for a playlist without loading all rows. */
export async function countChannelsFor(playlistId: string): Promise<number> {
  try {
    const db = getDb();
    return await db.channels.where("playlistId").equals(playlistId).count();
  } catch (e) {
    console.warn("Error counting channels:", e);
    return 0;
  }
}

/** Fetch channels for a playlist, querying local Dexie first, falling back to server SQLite. */
export async function loadChannelsFor(playlistId: string): Promise<Channel[]> {
  const db = getDb();
  try {
    const local = await db.channels.where("playlistId").equals(playlistId).toArray();
    if (local.length > 0) return local;
  } catch {}

  // Fallback to server SQLite database
  try {
    const res = await fetch(`/api/channels?playlistId=${encodeURIComponent(playlistId)}`);
    if (res.ok) {
      const serverChannels: Channel[] = await res.json();
      if (serverChannels.length > 0) {
        // Cache to local Dexie in background
        void replacePlaylistChannels(playlistId, serverChannels, false);
        return serverChannels;
      }
    }
  } catch {}

  return [];
}

/** Bulk replace all channels for a playlist in both local Dexie and server SQLite database. */
export async function replacePlaylistChannels(
  playlistId: string,
  channels: Channel[],
  syncToServer = true,
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.channels, async () => {
    await db.channels.where("playlistId").equals(playlistId).delete();
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
      const chunk = channels.slice(i, i + CHUNK_SIZE);
      if (chunk.length) {
        await db.channels.bulkPut(chunk);
      }
    }
  });

  if (syncToServer) {
    try {
      await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId, channels }),
      });
    } catch (e) {
      console.warn("Could not save channels to server database:", e);
    }
  }
}

/** Reset and delete the local database if corrupted or schema is broken. */
export async function repairDatabase(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (_db) {
      _db.close();
      _db = null;
    }
    await Dexie.delete("streamline-iptv");
    _db = new IptvDatabase();
    await _db.open();
  } catch (e) {
    console.error("Failed to repair database:", e);
  }
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

  try {
    await fetch("/api/playlists?id=all", { method: "DELETE" });
  } catch (e) {
    console.warn("Could not clear server database:", e);
  }
}
