"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { ChannelLogo } from "./channel-logo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface RailProps<T> {
  title: string;
  items: T[];
  onPlay: (item: T) => void;
  emptyText?: string;
}

export function ContentRail<T extends { id: string; name: string; logo?: string; group?: string; quality?: string }>({
  title,
  items,
  onPlay,
  emptyText = "Nothing here yet",
}: RailProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.85), behavior: "smooth" });
  };
  if (items.length === 0) {
    return (
      <section className="px-4 lg:px-6 py-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground/70">{emptyText}</p>
      </section>
    );
  }
  return (
    <section className="px-4 lg:px-6 py-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <div className="hidden sm:flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scroll(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2"
      >
        {items.map((item, i) => (
          <RailCard key={item.id + i} item={item} onPlay={() => onPlay(item)} />
        ))}
      </div>
    </section>
  );
}

function RailCard<T extends { name: string; logo?: string; group?: string; quality?: string }>({
  item,
  onPlay,
}: {
  item: T;
  onPlay: () => void;
}) {
  return (
    <motion.button
      whileHover={{ y: -6, scale: 1.03 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      onClick={onPlay}
      className="snap-start shrink-0 w-32 sm:w-40 text-left"
    >
      <div className="aspect-[3/4] rounded-2xl overflow-hidden border border-border/60 bg-card relative group">
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <ChannelLogo name={item.name} src={item.logo} size={64} rounded="lg" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-xs font-medium text-white line-clamp-2">{item.name}</p>
        </div>
        {item.quality && (
          <span className="absolute top-1.5 right-1.5 rounded bg-primary/90 px-1 text-[9px] font-bold text-white">
            {item.quality}
          </span>
        )}
      </div>
    </motion.button>
  );
}
