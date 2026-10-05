"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Heart, Clock, Tv, Flame, Play, Search } from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { ContentRail } from "./content-rail";
import { Button } from "@/components/ui/button";
import { ChannelLogo } from "./channel-logo";
import { gradientFromString } from "@/lib/iptv/hooks";
import type { Channel } from "@/lib/iptv/types";

export function HomeScreen() {
  const { channels, favorites, recent, groups, openPlayer, setView, setOnboardingOpen } = useIptv();

  const featured = useMemo(() => {
    if (channels.length === 0) return null;
    // pick a deterministic featured channel (logo + nice name)
    const withLogo = channels.filter((c) => c.logo);
    const pool = withLogo.length ? withLogo : channels;
    const idx = Math.floor(Date.now() / 86400000) % pool.length;
    return pool[idx];
  }, [channels]);

  const favChannels = useMemo(
    () => channels.filter((c) => favorites.has(c.id)).slice(0, 30),
    [channels, favorites],
  );
  const trending = useMemo(() => {
    // channels with logos + HD quality first
    return channels
      .filter((c) => c.logo)
      .slice(0, 30);
  }, [channels]);
  const byGroup = useMemo(() => {
    return groups.slice(0, 8).map((g) => ({
      name: g,
      items: channels.filter((c) => (c.group ?? "All Channels") === g).slice(0, 20),
    })).filter((g) => g.items.length > 0);
  }, [channels, groups]);

  if (channels.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-xl shadow-primary/30">
          <Tv className="h-12 w-12" />
        </div>
        <h1 className="mt-8 font-[var(--font-display)] text-3xl font-bold tracking-tight">
          Welcome to Streamline
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          A premium IPTV player. Add your own M3U playlist or try the legal demo to
          explore the interface.
        </p>
        <div className="mt-8 flex gap-3">
          <Button size="lg" onClick={() => setOnboardingOpen(true)}>
            <Sparkles className="mr-2 h-5 w-5" />
            Get started
          </Button>
          <Button size="lg" variant="outline" onClick={() => setView("live")}>
            Browse
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-10">
      {/* Hero featured */}
      {featured && <Hero featured={featured} onPlay={() => openPlayer(featured, channels)} />}

      <div className="space-y-6 pt-2">
        {recent.length > 0 && (
          <ContentRail
            title="Continue Watching"
            items={recent}
            onPlay={(c) => openPlayer(c, channels)}
            emptyText="Nothing watched yet"
          />
        )}
        <ContentRail
          title="Favorites"
          items={favChannels}
          onPlay={(c) => openPlayer(c, channels)}
          emptyText="Tap the ☆ on any channel to favorite it"
        />
        <ContentRail
          title="Now on Air"
          items={trending}
          onPlay={(c) => openPlayer(c, channels)}
        />
        {byGroup.map((g) => (
          <ContentRail
            key={g.name}
            title={g.name}
            items={g.items}
            onPlay={(c) => openPlayer(c, g.items)}
          />
        ))}
      </div>
    </div>
  );
}

function Hero({ featured, onPlay }: { featured: Channel; onPlay: () => void }) {
  const [c1, c2] = gradientFromString(featured.name);
  return (
    <section className="relative -mt-px overflow-hidden border-b border-border/60">
      {/* Background ambient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(60% 80% at 10% 20%, ${c1} / 0.45), radial-gradient(50% 70% at 90% 0%, ${c2} / 0.35), transparent)`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      <div className="relative flex flex-col items-start gap-6 p-6 lg:p-10 lg:flex-row lg:items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="shrink-0"
        >
          <div className="rounded-2xl overflow-hidden border border-border/60 shadow-2xl" style={{ boxShadow: `0 20px 60px -20px ${c1}` }}>
            <ChannelLogo name={featured.name} src={featured.logo} size={160} rounded="lg" />
          </div>
        </motion.div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
            <Flame className="h-4 w-4" /> Featured channel
          </div>
          <h1 className="mt-2 font-[var(--font-display)] text-4xl lg:text-6xl font-bold tracking-tight">
            {featured.name}
          </h1>
          <p className="mt-2 text-muted-foreground">{featured.group ?? "Live channel"}</p>
          <div className="mt-5 flex gap-3">
            <Button size="lg" className="h-12 px-6 text-base" onClick={onPlay}>
              <Play className="mr-2 h-5 w-5 fill-current" />
              Watch now
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-6 text-base" onClick={() => useIptv.getState().setView("live")}>
              <Search className="mr-2 h-5 w-5" />
              Browse all
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
