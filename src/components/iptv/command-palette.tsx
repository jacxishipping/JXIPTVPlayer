"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Command as CommandPrimitive } from "cmdk";
import { useIptv, type ViewKey } from "@/lib/iptv/store";
import { ChannelLogo } from "./channel-logo";
import {
  Home,
  Tv,
  CalendarClock,
  Film,
  Clapperboard,
  Heart,
  Settings as SettingsIcon,
  Search as SearchIcon,
  History,
  Tv2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { searchChannels } from "@/lib/iptv/search";

const NAV_ITEMS: { id: ViewKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "live", label: "Live TV", icon: Tv },
  { id: "guide", label: "Guide", icon: CalendarClock },
  { id: "movies", label: "Movies", icon: Film },
  { id: "series", label: "Series", icon: Clapperboard },
  { id: "favorites", label: "Favorites", icon: Heart },
  { id: "history", label: "History", icon: History },
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setView, channels, openPlayer } = useIptv();
  const [query, setQuery] = useState("");

  // close on Esc + reset query when closed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && commandOpen) setCommandOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  useEffect(() => {
    if (!commandOpen) {
      // defer reset to avoid setState-in-effect cascading
      const t = setTimeout(() => setQuery(""), 0);
      return () => clearTimeout(t);
    }
  }, [commandOpen]);

  const channelResults = useMemo(() => {
    if (!query.trim()) return [];
    return searchChannels(channels, query).slice(0, 8);
  }, [query, channels]);

  return (
    <AnimatePresence>
      {commandOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]"
          onClick={() => setCommandOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <CommandPrimitive
            loop
            className="relative w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="glass-strong rounded-2xl border shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 border-b border-border/60">
                <SearchIcon className="h-5 w-5 text-muted-foreground" />
                <CommandPrimitive.Input
                  autoFocus
                  placeholder="Search channels or jump to a view…"
                  className="flex-1 bg-transparent py-4 text-base outline-none placeholder:text-muted-foreground"
                  value={query}
                  onValueChange={setQuery}
                />
                <kbd className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  ESC
                </kbd>
              </div>
              <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-2">
                <CommandPrimitive.Empty>
                  No results for &ldquo;{query}&rdquo;
                </CommandPrimitive.Empty>

                {channelResults.length > 0 && (
                  <CommandPrimitive.Group heading="Channels" className="text-xs font-semibold uppercase text-muted-foreground px-2 pt-2">
                    {channelResults.map((ch) => (
                      <CommandPrimitive.Item
                        key={ch.id}
                        onSelect={() => {
                          openPlayer(ch, channels);
                          setCommandOpen(false);
                        }}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 aria-selected:bg-accent cursor-pointer"
                      >
                        <ChannelLogo name={ch.name} src={ch.logo} size={32} rounded="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{ch.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{ch.group}</p>
                        </div>
                        {ch.quality && (
                          <span className="rounded bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
                            {ch.quality}
                          </span>
                        )}
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}

                <CommandPrimitive.Group heading="Go to" className="text-xs font-semibold uppercase text-muted-foreground px-2 pt-3">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandPrimitive.Item
                        key={item.id}
                        onSelect={() => {
                          setView(item.id);
                          setCommandOpen(false);
                        }}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 aria-selected:bg-accent cursor-pointer"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{item.label}</span>
                      </CommandPrimitive.Item>
                    );
                  })}
                </CommandPrimitive.Group>
              </CommandPrimitive.List>
            </motion.div>
          </CommandPrimitive>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
