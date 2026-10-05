"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Heart, History as HistoryIcon, Film, Clapperboard, Tv, Clock } from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { ChannelLogo } from "./channel-logo";
import { ContentRail } from "./content-rail";
import { Button } from "@/components/ui/button";
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
  const isMovies = kind === "movies";
  const Icon = isMovies ? Film : Clapperboard;
  // Group by name keyword (Movies/Series/VOD)
  const filtered = useMemo(() => {
    const re = isMovies ? /\b(movie|vod|film)\b/i : /\b(series|tv show|serien)\b/i;
    const matches = channels.filter((c) => re.test(c.group ?? "") || re.test(c.name));
    // If no matches, just show all with logos
    return matches.length > 0 ? matches : channels.filter((c) => c.logo).slice(0, 40);
  }, [channels, isMovies]);

  return (
    <div className="px-4 lg:px-6 py-6">
      <header className="mb-6 flex items-center gap-2">
        <Icon className="h-6 w-6 text-primary" />
        <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-tight">
          {isMovies ? "Movies" : "Series"}
        </h1>
      </header>
      <div className="mb-4 rounded-xl border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
        {isMovies ? (
          <>
            <Tv className="inline mr-1 h-4 w-4" /> VOD content from your M3U / Xtream source appears here.
            Series with seasons &amp; episodes require an Xtream Codes source (coming soon).
          </>
        ) : (
          <>
            <Tv className="inline mr-1 h-4 w-4" /> Series episodes appear here when you add an Xtream Codes source.
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {filtered.map((ch, i) => (
          <PosterTile key={ch.id} channel={ch} index={i} onPlay={() => openPlayer(ch, filtered)} />
        ))}
      </div>
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
