"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Search, X, Star, Play } from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { useDebounced } from "@/lib/iptv/hooks";
import { searchChannels } from "@/lib/iptv/search";
import { ChannelLogo } from "./channel-logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SearchView() {
  const { channels, openPlayer, favorites, toggleFavorite, setView } = useIptv();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 180);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // also handle "/" to focus
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setView("home");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  const results = useMemo(() => {
    if (!debounced.trim()) return [];
    const r = searchChannels(channels, debounced);
    return r.slice(0, 200);
  }, [debounced, channels]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="p-4 lg:p-6 border-b border-border/60">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search channels, groups, programmes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-11 pr-10 h-12 text-base"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Press <kbd className="rounded border border-border/60 px-1">/</kbd> to focus, <kbd className="rounded border border-border/60 px-1">Esc</kbd> to exit.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {query.trim() === "" ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="mx-auto h-12 w-12 opacity-50" />
            <p className="mt-4">Type to search across all {channels.length.toLocaleString()} channels.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">No results for &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? "match" : "matches"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((ch) => (
                <motion.div
                  key={ch.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <button
                    onClick={() => openPlayer(ch, results)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left transition hover:border-primary/50 hover:bg-accent"
                  >
                    <ChannelLogo name={ch.name} src={ch.logo} size={44} rounded="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{ch.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{ch.group}</p>
                    </div>
                    {ch.quality && (
                      <span className="rounded bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
                        {ch.quality}
                      </span>
                    )}
                    <Play className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </button>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
