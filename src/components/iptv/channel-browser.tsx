"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { Search, LayoutGrid, List, Heart, Filter, X, Star } from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { useDebounced } from "@/lib/iptv/hooks";
import { searchChannels } from "@/lib/iptv/search";
import { ChannelLogo } from "./channel-logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

type SortKey = "name" | "number" | "group";

export function ChannelBrowser() {
  const {
    channels,
    groups,
    activeGroup,
    setActiveGroup,
    openPlayer,
    favorites,
    toggleFavorite,
    setView,
  } = useIptv();
  const [query, setQuery] = useState("");
  const [view, setBrowserView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<SortKey>("name");
  const [onlyFav, setOnlyFav] = useState(false);
  const [onlyHd, setOnlyHd] = useState(false);
  const [langFilter, setLangFilter] = useState<string | null>(null);
  const debounced = useDebounced(query, 180);

  const filtered = useMemo(() => {
    let list = channels.slice();
    if (activeGroup) list = list.filter((c) => (c.group ?? "All Channels") === activeGroup);
    if (onlyFav) list = list.filter((c) => favorites.has(c.id));
    if (onlyHd) {
      list = list.filter((c) => c.quality && /(4K|UHD|2160|1080|720|HD|FHD)/i.test(c.quality));
    }
    if (langFilter) list = list.filter((c) => c.language === langFilter);
    if (debounced) {
      // For small/medium lists fuse is fine; for >20k we cap results
      const searched = searchChannels(list, debounced);
      list = searched.length > 5000 ? searched.slice(0, 5000) : searched;
    }
    // sort
    list.sort((a, b) => {
      if (sort === "number") {
        const na = parseFloat(a.number ?? "999999");
        const nb = parseFloat(b.number ?? "999999");
        return na - nb;
      }
      if (sort === "group") return (a.group ?? "").localeCompare(b.group ?? "");
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [channels, activeGroup, onlyFav, onlyHd, langFilter, debounced, sort, favorites]);

  const languages = useMemo(() => {
    const s = new Set<string>();
    channels.forEach((c) => c.language && s.add(c.language));
    return Array.from(s).sort();
  }, [channels]);

  return (
    <div className="flex h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)]">
      {/* Category sidebar */}
      <CategorySidebar />

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 p-3 glass-strong border-b border-border/60">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${channels.length.toLocaleString()} channels…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-9 h-10"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Button
            variant={onlyFav ? "default" : "outline"}
            size="icon"
            className="h-10 w-10"
            onClick={() => setOnlyFav((v) => !v)}
            title="Favorites only"
          >
            <Heart className={cn("h-4 w-4", onlyFav && "fill-current")} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10" title="Filters">
                <Filter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Quality</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={onlyHd} onCheckedChange={setOnlyHd}>
                HD / 4K only
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Language</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setLangFilter(null)}>
                All languages
              </DropdownMenuItem>
              {languages.map((l) => (
                <DropdownMenuItem key={l} onSelect={() => setLangFilter(l)}>
                  {l} {langFilter === l && "✓"}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              {(["name", "number", "group"] as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onSelect={() => setSort(k)}>
                  {sort === k ? "✓ " : ""}{k === "name" ? "Name" : k === "number" ? "Channel #" : "Group"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex rounded-lg border border-border/60 overflow-hidden">
            <Button
              variant={view === "grid" ? "default" : "ghost"}
              size="icon"
              className="h-10 w-10 rounded-none"
              onClick={() => setBrowserView("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="icon"
              className="h-10 w-10 rounded-none"
              onClick={() => setBrowserView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Active filters chips */}
        {(activeGroup || onlyFav || onlyHd || langFilter) && (
          <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-border/60">
            {activeGroup && (
              <Badge variant="secondary" className="gap-1">
                {activeGroup}
                <button onClick={() => setActiveGroup(null)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {onlyFav && (
              <Badge variant="secondary" className="gap-1" onClick={() => setOnlyFav(false)}>
                Favorites
                <X className="h-3 w-3" />
              </Badge>
            )}
            {onlyHd && (
              <Badge variant="secondary" className="gap-1" onClick={() => setOnlyHd(false)}>
                HD/4K
                <X className="h-3 w-3" />
              </Badge>
            )}
            {langFilter && (
              <Badge variant="secondary" className="gap-1" onClick={() => setLangFilter(null)}>
                {langFilter}
                <X className="h-3 w-3" />
              </Badge>
            )}
          </div>
        )}

        {/* Grid or list */}
        {filtered.length === 0 ? (
          <EmptyState hasChannels={channels.length > 0} onAddSource={() => setView("settings")} />
        ) : view === "grid" ? (
          <VirtualizedGrid
            channels={filtered}
            onPlay={openPlayer}
            favorites={favorites}
            onFav={toggleFavorite}
          />
        ) : (
          <VirtualizedList
            channels={filtered}
            onPlay={openPlayer}
            favorites={favorites}
            onFav={toggleFavorite}
          />
        )}
      </div>
    </div>
  );
}

function CategorySidebar() {
  const { groups, activeGroup, setActiveGroup, channels } = useIptv();
  const groupCounts = useMemo(() => {
    const m: Record<string, number> = {};
    channels.forEach((c) => {
      const g = c.group ?? "All Channels";
      m[g] = (m[g] ?? 0) + 1;
    });
    return m;
  }, [channels]);

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border/60 bg-sidebar/50">
      <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Categories
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <button
          onClick={() => setActiveGroup(null)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition",
            !activeGroup ? "bg-primary/15 text-primary" : "hover:bg-muted",
          )}
        >
          <span>All Channels</span>
          <span className="text-xs text-muted-foreground">{channels.length.toLocaleString()}</span>
        </button>
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition truncate",
              activeGroup === g ? "bg-primary/15 text-primary" : "hover:bg-muted",
            )}
          >
            <span className="truncate text-left">{g}</span>
            <span className="text-xs text-muted-foreground ml-2 shrink-0">
              {(groupCounts[g] ?? 0).toLocaleString()}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function VirtualizedGrid({
  channels,
  onPlay,
  favorites,
  onFav,
}: {
  channels: ReturnType<typeof useIptv.getState>["channels"];
  onPlay: ReturnType<typeof useIptv.getState>["openPlayer"];
  favorites: Set<string>;
  onFav: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(parentRef);
  const colWidth = 160;
  const cols = Math.max(2, Math.floor((containerWidth - 24) / colWidth));

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(channels.length / cols),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 4,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto p-3">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((row) => {
          const start = row.index * cols;
          const items = channels.slice(start, start + cols);
          return (
            <div
              key={row.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: "0.75rem",
                padding: "0 0.25rem",
              }}
            >
              {items.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  channel={ch}
                  onPlay={() => onPlay(ch, channels)}
                  isFav={favorites.has(ch.id)}
                  onFav={() => onFav(ch.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function ChannelCard({
  channel,
  onPlay,
  isFav,
  onFav,
}: {
  channel: ReturnType<typeof useIptv.getState>["channels"][number];
  onPlay: () => void;
  isFav: boolean;
  onFav: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="group relative aspect-[4/3] sm:aspect-square cursor-pointer"
      onClick={onPlay}
    >
      <div className="absolute inset-0 rounded-2xl bg-card border border-border/60 overflow-hidden transition group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/10">
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <ChannelLogo name={channel.name} src={channel.logo} size={72} rounded="lg" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 to-transparent">
          <p className="text-sm font-medium text-white line-clamp-2">{channel.name}</p>
          <div className="mt-0.5 flex items-center gap-1">
            {channel.group && (
              <span className="text-[10px] text-white/60 truncate">{channel.group}</span>
            )}
            {channel.quality && (
              <span className="ml-auto rounded bg-primary/80 px-1 text-[9px] font-bold text-white">
                {channel.quality}
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onFav();
        }}
        className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/60"
        aria-label={isFav ? "Remove favorite" : "Add favorite"}
      >
        <Star className={cn("h-4 w-4", isFav && "fill-primary text-primary")} />
      </button>
    </motion.div>
  );
}

function VirtualizedList({
  channels,
  onPlay,
  favorites,
  onFav,
}: {
  channels: ReturnType<typeof useIptv.getState>["channels"];
  onPlay: ReturnType<typeof useIptv.getState>["openPlayer"];
  favorites: Set<string>;
  onFav: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });
  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto px-3 py-2">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const ch = channels[item.index];
          return (
            <button
              key={ch.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`,
              }}
              onClick={() => onPlay(ch, channels)}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-muted focus-visible:bg-muted"
            >
              <ChannelLogo name={ch.name} src={ch.logo} size={40} rounded="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{ch.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {ch.group ?? "—"} {ch.language && `· ${ch.language}`}
                </p>
              </div>
              {ch.quality && (
                <Badge variant="secondary" className="shrink-0">{ch.quality}</Badge>
              )}
              {ch.number && (
                <span className="hidden sm:block w-12 text-right font-mono text-xs text-muted-foreground">
                  {ch.number}
                </span>
              )}
              <Star
                className={cn(
                  "h-4 w-4 shrink-0 transition",
                  favorites.has(ch.id)
                    ? "fill-primary text-primary"
                    : "text-muted-foreground opacity-0 group-hover:opacity-100",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onFav(ch.id);
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ hasChannels, onAddSource }: { hasChannels: boolean; onAddSource: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Search className="h-9 w-9" />
      </div>
      <h3 className="mt-6 text-lg font-semibold">
        {hasChannels ? "No channels match" : "No channels yet"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        {hasChannels
          ? "Try adjusting your search or filters."
          : "Add a playlist to get started."}
      </p>
      {!hasChannels && (
        <Button className="mt-6" onClick={onAddSource}>
          Add a source
        </Button>
      )}
    </div>
  );
}
