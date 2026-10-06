"use client";

import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useIptv } from "@/lib/iptv/store";
import { getDb, loadSettings, saveSettings, syncPlaylistsWithServer, loadChannelsFor } from "@/lib/iptv/db";
import { Sidebar, MobileTabBar, MobileTopBar } from "./sidebar";
import { TopBar } from "./topbar";
import { HomeScreen } from "./home-screen";
import { ChannelBrowser } from "./channel-browser";
import EpgGrid from "./epg-grid";
import { SettingsPanel } from "./settings-panel";
import { SearchView } from "./search-view";
import { Player } from "./player";
import { CommandPalette } from "./command-palette";
import { OnboardingWizard } from "./onboarding-wizard";
import { AddSourceModal } from "./add-source-modal";
import { KeyboardShortcutsHelp } from "./keyboard-shortcuts-help";
import { FavoritesView, HistoryView, MediaPlaceholderView } from "./library-views";
import { RegisterSW } from "./register-sw";

export function IptvApp() {
  const {
    view,
    playlists,
    activePlaylistId,
    setPlaylists,
    setActivePlaylist,
    setChannels,
    onboardingOpen,
    setOnboardingOpen,
    addSourceOpen,
    commandOpen,
    keyboardHelpOpen,
    favorites,
    toggleFavorite,
    settings,
    setSettings,
  } = useIptv();
  const [booted, setBooted] = useState(false);

  // Bootstrap: load settings, playlists, channels from Dexie on mount
  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      try {
        const s = await loadSettings();
        setSettings(s);
        // apply theme + accent
        if (s.theme === "light") document.documentElement.classList.remove("dark");
        else document.documentElement.classList.add("dark");
        if (s.accent) {
          document.documentElement.style.setProperty("--primary", s.accent);
          document.documentElement.style.setProperty("--ring", s.accent);
          document.documentElement.style.setProperty("--sidebar-primary", s.accent);
        }
        // Sync and load playlists from server SQLite + local cache
        const all = await syncPlaylistsWithServer();
        setPlaylists(all);
        if (all.length === 0) {
          setOnboardingOpen(true);
        } else {
          // load channels for the first playlist (or active)
          const activeId = all[0].id;
          setActivePlaylist(activeId);
          const channels = await loadChannelsFor(activeId);
          const groups = Array.from(new Set(channels.map((c) => c.group ?? "All Channels"))).sort();
          setChannels(channels, groups);
        }
        // Load favorites
        const db = getDb();
        let fav = await db.favorites.get("default");
        if (!fav) {
          try {
            const res = await fetch("/api/favorites");
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.channelIds) && data.channelIds.length > 0) {
                fav = { id: "default", name: "Favorites", createdAt: Date.now(), channelIds: data.channelIds };
                await db.favorites.put(fav);
              }
            }
          } catch {}
        }
        if (!fav) {
          fav = { id: "default", name: "Favorites", createdAt: Date.now(), channelIds: [] };
          await db.favorites.put(fav);
        }
        useIptv.getState().setFavorites(new Set(fav.channelIds));
      } catch (e) {
        console.error("Bootstrap failed:", e);
        setOnboardingOpen(true);
      } finally {
        setBooted(true);
      }
    })();
  }, []);

  // Persist favorites to Dexie and server SQLite database whenever the set changes
  useEffect(() => {
    if (!booted) return;
    (async () => {
      const db = getDb();
      const channelIds = Array.from(favorites);
      await db.favorites.put({
        id: "default",
        name: "Favorites",
        createdAt: Date.now(),
        channelIds,
      });
      try {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelIds }),
        });
      } catch {}
    })();
  }, [favorites, booted]);

  // Apply reduced motion preference
  useEffect(() => {
    if (settings.reducedMotion) {
      document.documentElement.style.setProperty("--ease-spring", "ease-out");
    } else {
      document.documentElement.style.setProperty("--ease-spring", "cubic-bezier(0.34, 1.56, 0.64, 1)");
    }
  }, [settings.reducedMotion]);

  // Global keyboard shortcuts (? for help)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        useIptv.getState().setKeyboardHelpOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useIptv.getState().setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load channels when active playlist changes (after boot)
  useEffect(() => {
    if (!booted || !activePlaylistId) return;
    (async () => {
      const channels = await loadChannelsFor(activePlaylistId);
      const groups = Array.from(new Set(channels.map((c) => c.group ?? "All Channels"))).sort();
      setChannels(channels, groups);
    })();
  }, [activePlaylistId, booted, setChannels]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <RegisterSW />
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <MobileTopBar />
          <TopBar />
          <main className="flex-1 pb-20 lg:pb-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="min-h-[calc(100vh-4rem)]"
              >
                {view === "home" && <HomeScreen />}
                {view === "live" && <ChannelBrowser />}
                {view === "guide" && <EpgGrid />}
                {view === "movies" && <MediaPlaceholderView kind="movies" />}
                {view === "series" && <MediaPlaceholderView kind="series" />}
                {view === "favorites" && <FavoritesView />}
                {view === "history" && <HistoryView />}
                {view === "search" && <SearchView />}
                {view === "settings" && <SettingsPanel />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      <MobileTabBar />

      {/* Overlays */}
      <Player />
      <CommandPalette />
      <AddSourceModal />
      <KeyboardShortcutsHelp />
      {onboardingOpen && <OnboardingWizard />}
    </div>
  );
}
