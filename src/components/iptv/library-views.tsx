"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Heart, History as HistoryIcon, Film, Clapperboard, Tv, Clock, Search, X } from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { ChannelLogo } from "./channel-logo";
import { ContentRail } from "./content-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Channel } from "@/lib/iptv/types";

export function FavoritesView() {
  const { channels, favorites, openPlayer, setView } = useIptv();
  const favs = useMemo(
    () => channels.filter((c) => favorites.has(c.id)),
    [channels, favorites],
  );

  if (favs.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-10 w-10" />}
        title="No favorites yet"
        desc="Tap the star icon on any channel to add it here."
        action={<Button onClick={() => setView("live")}>Browse channels</Button>}
      />
    );
  }

  return (
    <div className="px-4 lg:px-6 py-6">
      <header className="mb-6 flex items-center gap-2">
        <Heart className="h-6 w-6 text-primary" />
        <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-tight">Favorites</h1>
        <span className="ml-2 text-sm text-muted-foreground">{favs.length} channels</span>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {favs.map((ch, i) => (
          <ChannelTile key={ch.id} channel={ch} index={i} onPlay={() => openPlayer(ch, favs)} />
        ))}
      </div>
    </div>
  );
}

export function HistoryView() {
  const { recent, openPlayer, setView } = useIptv();
  if (recent.length === 0) {
    return (
      <EmptyState
        icon={<HistoryIcon className="h-10 w-10" />}
        title="No history yet"
        desc="Channels you watch will show up here."
        action={<Button onClick={() => setView("live")}>Start watching</Button>}
      />
    );
  }
  return (
    <div className="px-4 lg:px-6 py-6">
      <header className="mb-6 flex items-center gap-2">
        <HistoryIcon className="h-6 w-6 text-primary" />
        <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-tight">History</h1>
      </header>
      <ul className="space-y-1">
        {recent.map((ch, i) => (
          <li key={ch.id}>
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.4) }}
              onClick={() => openPlayer(ch, recent)}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted"
            >
              <ChannelLogo name={ch.name} src={ch.logo} size={40} rounded="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{ch.name}</p>
                <p className="text-xs text-muted-foreground truncate">{ch.group}</p>
              </div>
              <Clock className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
            </motion.button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MediaPlaceholderView({ kind }: { kind: "movies" | "series" }) {
  const { channels, openPlayer } = useIptv();
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const isMovies = kind === "movies";
  const Icon = isMovies ? Film : Clapperboard;

  // Filter channels matching movies or series
  const baseItems = useMemo(() => {
    const re = isMovies ? /\b(movie|vod|film|cinema)\b/i : /\b(series|tv show|serien|season|episode)\b/i;
    const matches = channels.filter((c) => re.test(c.group ?? "") || re.test(c.name));
    return matches.length > 0 ? matches : channels.filter((c) => c.logo).slice(0, 40);
  }, [channels, isMovies]);

  // Extract unique groups
  const groups = useMemo(() => {
    const s = new Set<string>();
    baseItems.forEach((c) => {
      if (c.group) s.add(c.group);
    });
    return Array.from(s).sort();
  }, [baseItems]);

  const filtered = useMemo(() => {
    let list = baseItems;
    if (selectedGroup) {
      list = list.filter((c) => c.group === selectedGroup);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.group && c.group.toLowerCase().includes(q)));
    }
    return list;
  }, [baseItems, selectedGroup, search]);

  return (
    <div className="px-4 lg:px-6 py-6 space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-6 w-6 text-primary" />
          <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-tight">
            {isMovies ? "Movies" : "Series"}
          </h1>
          <Badge variant="secondary" className="ml-2 font-mono">
            {filtered.length}
          </Badge>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Search ${isMovies ? "movies" : "series"}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-8 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5 pb-1">
          <Button
            size="sm"
            variant={selectedGroup === null ? "default" : "outline"}
            onClick={() => setSelectedGroup(null)}
            className="h-7 text-xs rounded-lg"
          >
            All Categories
          </Button>
          {groups.slice(0, 12).map((g) => (
            <Button
              key={g}
              size="sm"
              variant={selectedGroup === g ? "default" : "outline"}
              onClick={() => setSelectedGroup(g)}
              className="h-7 text-xs rounded-lg"
            >
              {g.replace(/^(Movies:\s*|Series:\s*)/i, "")}
            </Button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-3.5 text-xs text-muted-foreground flex items-center gap-2">
        <Tv className="h-4 w-4 shrink-0 text-primary" />
        <span>
          {isMovies
            ? "VOD films and on-demand titles from your M3U or Xtream source appear here. Click any poster to watch instantly."
            : "TV Series and episodic content from your playlist appear here. Click any poster to start streaming."}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No {isMovies ? "movies" : "series"} matched your query.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((ch, i) => (
            <PosterTile key={ch.id} channel={ch} index={i} onPlay={() => openPlayer(ch, filtered)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelTile({
  channel,
  index,
  onPlay,
}: {
  channel: Channel;
  index: number;
  onPlay: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.4) }}
      whileHover={{ y: -4 }}
      onClick={onPlay}
      className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition hover:border-primary/40 hover:bg-accent"
    >
      <ChannelLogo name={channel.name} src={channel.logo} size={44} rounded="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{channel.name}</p>
        <p className="text-xs text-muted-foreground truncate">{channel.group}</p>
      </div>
    </motion.button>
  );
}

function PosterTile({
  channel,
  index,
  onPlay,
}: {
  channel: Channel;
  index: number;
  onPlay: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.02, 0.4) }}
      whileHover={{ y: -6 }}
      onClick={onPlay}
      className="group text-left"
    >
      <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-border/60 bg-card relative">
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <ChannelLogo name={channel.name} src={channel.logo} size={80} rounded="lg" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
          <p className="text-xs font-medium text-white line-clamp-2">{channel.name}</p>
        </div>
      </div>
    </motion.button>
  );
}

function EmptyState({
  icon,
  title,
  desc,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <h2 className="mt-6 text-2xl font-bold">{title}</h2>
      <p className="mt-2 max-w-sm text-muted-foreground">{desc}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
