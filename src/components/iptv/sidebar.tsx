"use client";

import { motion } from "framer-motion";
import {
  Home,
  Tv,
  CalendarClock,
  Film,
  Clapperboard,
  Heart,
  Search,
  Settings as SettingsIcon,
  History,
  Tv2,
  Plus,
} from "lucide-react";
import { useIptv, type ViewKey } from "@/lib/iptv/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChannelLogo } from "./channel-logo";

const NAV: { key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "live", label: "Live TV", icon: Tv },
  { key: "guide", label: "Guide", icon: CalendarClock },
  { key: "movies", label: "Movies", icon: Film },
  { key: "series", label: "Series", icon: Clapperboard },
  { key: "favorites", label: "Favorites", icon: Heart },
  { key: "history", label: "History", icon: History },
  { key: "search", label: "Search", icon: Search },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  const { view, setView, setAddSourceOpen, activePlaylistId, channels } = useIptv();

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border/60 bg-sidebar">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Tv2 className="h-5 w-5" />
        </div>
        <span className="font-[var(--font-display)] text-xl font-bold tracking-tight">
          Streamline
        </span>
      </div>
      <nav className="flex-1 px-3 py-2">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <li key={item.key}>
                <button
                  onClick={() => setView(item.key)}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon className="h-5 w-5 shrink-0" />
                  {item.label}
                  {item.key === "favorites" && (
                    <Badge count={useIptv.getState().favorites.size} active={active} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => setAddSourceOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add source
        </Button>
        {activePlaylistId && channels.length > 0 && (
          <p className="mt-3 px-1 text-xs text-muted-foreground">
            {channels.length.toLocaleString()} channels loaded
          </p>
        )}
      </div>
    </aside>
  );
}

function Badge({ count, active }: { count: number; active: boolean }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "ml-auto rounded-full px-2 py-0.5 text-xs",
        active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

/** Mobile bottom tab bar — replaces the sidebar on small screens. */
export function MobileTabBar() {
  const { view, setView } = useIptv();
  const items = NAV.filter((n) => ["home", "live", "guide", "favorites", "search"].includes(n.key));
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-border/60 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Mobile top brand bar. */
export function MobileTopBar() {
  const { setView, channels, activePlaylistId } = useIptv();
  return (
    <div className="lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between px-4 glass-strong border-b border-border/60">
      <button
        className="flex items-center gap-2"
        onClick={() => setView("home")}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Tv2 className="h-4 w-4" />
        </div>
        <span className="font-[var(--font-display)] text-lg font-bold">Streamline</span>
      </button>
      {activePlaylistId && channels[0] && (
        <ChannelLogo name={channels[0].name} src={channels[0].logo} size={28} rounded="full" />
      )}
    </div>
  );
}
