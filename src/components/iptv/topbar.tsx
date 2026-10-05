"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Command, Tv2, ChevronDown, Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIptv } from "@/lib/iptv/store";
import { getDb, loadSettings } from "@/lib/iptv/db";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { setCommandOpen, setAddSourceOpen, playlists, activePlaylistId, setActivePlaylist, setSettings, channels } =
    useIptv();
  const { setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // mount detection for theme toggle hydration safety
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);

  // Load persisted settings into the store once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    loadSettings().then((s) => {
      setSettings(s);
      if (s.theme === "dark") document.documentElement.classList.add("dark");
      else if (s.theme === "light") document.documentElement.classList.remove("dark");
    });
  }, [setSettings]);

  // Keyboard shortcut for command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);

  return (
    <header className="sticky top-0 z-30 hidden lg:flex h-16 items-center gap-3 px-6 glass-strong border-b border-border/60">
      {/* Playlist switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-3 h-10">
            <Tv2 className="h-4 w-4 text-primary" />
            <span className="max-w-[180px] truncate font-medium">
              {activePlaylist?.name ?? "No playlist"}
            </span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Playlists</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {playlists.length === 0 && (
            <div className="px-2 py-3 text-sm text-muted-foreground">No playlists yet.</div>
          )}
          {playlists.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={async () => {
                setActivePlaylist(p.id);
                const db = getDb();
                const channels = await db.channels.where("playlistId").equals(p.id).toArray();
                const groups = Array.from(new Set(channels.map((c) => c.group ?? "All"))).sort();
                useIptv.getState().setChannels(channels, groups);
              }}
              className={cn("flex items-center justify-between", p.id === activePlaylistId && "bg-accent")}
            >
              <span className="truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.channelCount}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAddSourceOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add another source
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1" />

      {/* Search trigger */}
      <button
        onClick={() => useIptv.getState().setView("search")}
        className="group flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted w-72"
      >
        <Search className="h-4 w-4" />
        <span>Search channels…</span>
        <kbd className="ml-auto hidden items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-mono sm:flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>

      {/* Theme toggle */}
      {mounted && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Sun className="h-5 w-5 dark:hidden" />
              <Moon className="h-5 w-5 hidden dark:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setTheme("light"); setSettings({ theme: "light" }); }}>
              <Sun className="mr-2 h-4 w-4" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setTheme("dark"); setSettings({ theme: "dark" }); }}>
              <Moon className="mr-2 h-4 w-4" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setTheme("system"); setSettings({ theme: "system" }); }}>
              <Monitor className="mr-2 h-4 w-4" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
