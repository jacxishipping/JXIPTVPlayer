import { create } from "zustand";
import type { Channel, Playlist, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./db";

export type ViewKey =
  | "home"
  | "live"
  | "guide"
  | "movies"
  | "series"
  | "favorites"
  | "search"
  | "settings"
  | "history";

interface IptvState {
  // data
  playlists: Playlist[];
  activePlaylistId: string | null;
  channels: Channel[]; // channels for the active playlist (in-memory cache)
  groups: string[];
  settings: Settings;
  favorites: Set<string>;
  history: Channel[];
  recent: Channel[]; // recently watched channels list (cached order)

  // ui
  view: ViewKey;
  activeGroup: string | null;
  search: string;
  /** fullscreen player open */
  playerOpen: boolean;
  playerChannel: Channel | null;
  playerQueue: Channel[]; // for "next episode" / zap list
  playerIndex: number;
  infoOverlayVisible: boolean;
  keyboardHelpOpen: boolean;
  commandOpen: boolean;
  onboardingOpen: boolean;
  addSourceOpen: boolean;
  /** mobile bottom-sheet nav */
  mobileNavOpen: boolean;

  // actions
  setView: (v: ViewKey) => void;
  setPlaylists: (p: Playlist[]) => void;
  setActivePlaylist: (id: string | null) => void;
  setChannels: (c: Channel[], groups: string[]) => void;
  setSettings: (s: Partial<Settings>) => void;
  toggleFavorite: (channelId: string) => void;
  setFavorites: (ids: Set<string>) => void;
  setHistory: (c: Channel[]) => void;
  setRecent: (c: Channel[]) => void;
  setActiveGroup: (g: string | null) => void;
  setSearch: (s: string) => void;
  openPlayer: (channel: Channel, queue?: Channel[]) => void;
  closePlayer: () => void;
  zap: (dir: 1 | -1) => void;
  setInfoOverlay: (v: boolean) => void;
  setKeyboardHelpOpen: (v: boolean) => void;
  setCommandOpen: (v: boolean) => void;
  setOnboardingOpen: (v: boolean) => void;
  setAddSourceOpen: (v: boolean) => void;
  setMobileNavOpen: (v: boolean) => void;
}

const initialSettings: Settings = { ...DEFAULT_SETTINGS };

export const useIptv = create<IptvState>((set, get) => ({
  playlists: [],
  activePlaylistId: null,
  channels: [],
  groups: [],
  settings: initialSettings,
  favorites: new Set(),
  history: [],
  recent: [],

  view: "home",
  activeGroup: null,
  search: "",
  playerOpen: false,
  playerChannel: null,
  playerQueue: [],
  playerIndex: 0,
  infoOverlayVisible: false,
  keyboardHelpOpen: false,
  commandOpen: false,
  onboardingOpen: false,
  addSourceOpen: false,
  mobileNavOpen: false,

  setView: (v) => set({ view: v, mobileNavOpen: false }),
  setPlaylists: (p) => set({ playlists: p }),
  setActivePlaylist: (id) => set({ activePlaylistId: id, activeGroup: null }),
  setChannels: (c, groups) => set({ channels: c, groups }),
  setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
  toggleFavorite: (channelId) => {
    const next = new Set(get().favorites);
    if (next.has(channelId)) next.delete(channelId);
    else next.add(channelId);
    set({ favorites: next });
  },
  setFavorites: (ids) => set({ favorites: ids }),
  setHistory: (c) => set({ history: c }),
  setRecent: (c) => set({ recent: c }),
  setActiveGroup: (g) => set({ activeGroup: g }),
  setSearch: (s) => set({ search: s }),
  openPlayer: (channel, queue) => {
    const q = queue && queue.length ? queue : [channel];
    const idx = Math.max(
      0,
      q.findIndex((c) => c.id === channel.id),
    );
    set({
      playerOpen: true,
      playerChannel: channel,
      playerQueue: q,
      playerIndex: idx,
      infoOverlayVisible: true,
    });
  },
  closePlayer: () => set({ playerOpen: false, playerChannel: null, infoOverlayVisible: false }),
  zap: (dir) => {
    const { playerQueue, playerIndex } = get();
    if (playerQueue.length < 2) return;
    const nextIdx = (playerIndex + dir + playerQueue.length) % playerQueue.length;
    set({
      playerIndex: nextIdx,
      playerChannel: playerQueue[nextIdx],
      infoOverlayVisible: true,
    });
  },
  setInfoOverlay: (v) => set({ infoOverlayVisible: v }),
  setKeyboardHelpOpen: (v) => set({ keyboardHelpOpen: v }),
  setCommandOpen: (v) => set({ commandOpen: v }),
  setOnboardingOpen: (v) => set({ onboardingOpen: v }),
  setAddSourceOpen: (v) => set({ addSourceOpen: v }),
  setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
}));
