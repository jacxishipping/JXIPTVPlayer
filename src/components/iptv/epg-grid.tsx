"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  Loader2,
  Play,
  Tv2,
  Upload,
  Video,
  Globe,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChannelLogo } from "./channel-logo";
import { useIptv } from "@/lib/iptv/store";
import { getDb } from "@/lib/iptv/db";
import { parseXmltv } from "@/lib/iptv/xmltv-parser";
import { formatTimeRange, useClientValue } from "@/lib/iptv/hooks";
import type { Channel, EpgProgramme } from "@/lib/iptv/types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ---------- Layout constants ----------
const LEFT_COL_WIDTH = 200;
const RULER_HEIGHT = 44;
const ROW_HEIGHT = 56;
const WINDOW_HOURS = 6;
const MAX_CHANNELS = 80;

type ZoomKey = "30m" | "1h" | "3h";

/** Each zoom level sets the pixel width per minute (per hour). Default 1h = 180px/hr => 3px/min. */
const ZOOM_CONFIG: Record<ZoomKey, { pxPerMin: number; label: string }> = {
  "30m": { pxPerMin: 6, label: "30 min" },
  "1h": { pxPerMin: 3, label: "1 hour" },
  "3h": { pxPerMin: 1, label: "3 hours" },
};

function startOfHour(t: number): number {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function formatHour(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDayShort(t: number): string {
  return new Date(t).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatRange(t: number): string {
  return new Date(t).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EpgGrid() {
  const channels = useIptv((s) => s.channels);
  const { toast } = useToast();

  const [zoom, setZoom] = useState<ZoomKey>("1h");
  const [windowStart, setWindowStart] = useState<number>(() => startOfHour(Date.now()));
  const [now, setNow] = useState<number>(() => Date.now());
  const [programmesByTvgId, setProgrammesByTvgId] = useState<Map<string, EpgProgramme[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [epgUrlInput, setEpgUrlInput] = useState("");
  const [importingUrl, setImportingUrl] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // SSR safety: only render real content after hydration to avoid Date.now() mismatches.
  const mounted = useClientValue(() => true, false);

  const pxPerMin = ZOOM_CONFIG[zoom].pxPerMin;
  const windowMs = WINDOW_HOURS * 60 * 60 * 1000;
  const windowEnd = windowStart + windowMs;
  const gridWidth = WINDOW_HOURS * 60 * pxPerMin;

  // ---- Tick "now" every 30 seconds ----
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ---- Load programmes for the active tvgIds whenever channels change (or after import) ----
  useEffect(() => {
    let cancelled = false;
    const tvgIds = Array.from(
      new Set(channels.map((c) => c.tvgId).filter(Boolean) as string[]),
    );
    if (tvgIds.length === 0) {
      setLoading(false);
      setProgrammesByTvgId(new Map());
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const db = getDb();
        const map = new Map<string, EpgProgramme[]>();
        const rows = await db.epg.where("tvgId").anyOf(tvgIds).toArray();
        for (const p of rows) {
          const arr = map.get(p.tvgId) ?? [];
          arr.push(p);
          map.set(p.tvgId, arr);
        }
        for (const arr of map.values()) arr.sort((a, b) => a.start - b.start);
        if (!cancelled) {
          setProgrammesByTvgId(map);
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to load EPG", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channels, refreshKey]);

  // Only keep channels that have a tvgId AND at least one programme in the EPG DB.
  const visibleChannels = useMemo(
    () =>
      channels
        .filter((c) => c.tvgId && (programmesByTvgId.get(c.tvgId)?.length ?? 0) > 0)
        .slice(0, MAX_CHANNELS),
    [channels, programmesByTvgId],
  );

  // Hour ticks on the time ruler.
  const hourTicks = useMemo(() => {
    const ticks: { time: number; x: number; label: string; sub: string | null }[] = [];
    const firstHour = startOfHour(windowStart);
    for (let t = firstHour; t <= windowEnd + 1; t += 60 * 60 * 1000) {
      const x = ((t - windowStart) / 60_000) * pxPerMin;
      if (x > gridWidth + 1) break;
      const isMidnight = new Date(t).getHours() === 0;
      ticks.push({
        time: t,
        x,
        label: formatHour(t),
        sub: isMidnight || ticks.length === 0 ? formatDayShort(t) : null,
      });
    }
    return ticks;
  }, [windowStart, windowEnd, pxPerMin, gridWidth]);

  // Filter programmes per channel row to the visible time window.
  const rowsData = useMemo(
    () =>
      visibleChannels.map((ch) => {
        const all = programmesByTvgId.get(ch.tvgId!) ?? [];
        return all.filter((p) => p.start <= windowEnd && p.stop >= windowStart);
      }),
    [visibleChannels, programmesByTvgId, windowStart, windowEnd],
  );

  const nowX = ((now - windowStart) / 60_000) * pxPerMin;
  const nowVisible = now >= windowStart && now <= windowEnd;

  // ---- Navigation handlers ----
  const goToNow = useCallback(() => {
    const containerWidth = scrollRef.current?.clientWidth ?? 800;
    const visibleBodyWidth = Math.max(200, containerWidth - LEFT_COL_WIDTH);
    const targetOffsetMin = visibleBodyWidth / 3 / pxPerMin;
    setWindowStart(startOfHour(now - targetOffsetMin * 60_000));
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    });
  }, [now, pxPerMin]);

  const shift = useCallback((hours: number) => {
    setWindowStart((s) => s + hours * 60 * 60 * 1000);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    });
  }, []);

  const onZoomChange = useCallback(
    (z: ZoomKey) => {
      if (z === zoom) return;
      const oldPxPerMin = ZOOM_CONFIG[zoom].pxPerMin;
      const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
      // Preserve the time at the left edge of the visible body across zoom changes.
      const leftTime = windowStart + scrollLeft / oldPxPerMin;
      setZoom(z);
      setWindowStart(startOfHour(leftTime));
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = 0;
      });
    },
    [zoom, windowStart],
  );

  // ---- XMLTV import handler ----
  const handleXmltvImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const { programmes } = parseXmltv(text);
        if (programmes.length === 0) {
          toast({
            title: "No programmes found",
            description: "The XMLTV file didn't contain any programmes.",
            variant: "destructive",
          });
          return;
        }
        const db = getDb();
        await db.epg.bulkPut(programmes);
        toast({
          title: "EPG imported",
          description: `${programmes.length.toLocaleString()} programmes added to the guide.`,
        });
        setRefreshKey((k) => k + 1);
      } catch (err) {
        console.error(err);
        toast({
          title: "Import failed",
          description: err instanceof Error ? err.message : "Could not parse the file.",
          variant: "destructive",
        });
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [toast],
  );

  // ---- XMLTV URL fetch handler ----
  const handleUrlImport = useCallback(async () => {
    if (!epgUrlInput.trim()) return;
    setImportingUrl(true);
    try {
      const target = epgUrlInput.trim();
      let text = "";
      try {
        const res = await fetch(target);
        if (res.ok) text = await res.text();
      } catch {}
      if (!text) {
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(target)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        text = await res.text();
      }
      const { programmes } = parseXmltv(text);
      if (programmes.length === 0) {
        toast({
          title: "No programmes found",
          description: "The XMLTV document contained no programmes.",
          variant: "destructive",
        });
        return;
      }
      const db = getDb();
      await db.epg.bulkPut(programmes);
      toast({
        title: "EPG imported",
        description: `${programmes.length.toLocaleString()} programmes added to the guide.`,
      });
      setRefreshKey((k) => k + 1);
      setUrlDialogOpen(false);
      setEpgUrlInput("");
    } catch (err) {
      toast({
        title: "Failed to fetch EPG",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setImportingUrl(false);
    }
  }, [epgUrlInput, toast]);

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const noChannels = channels.length === 0;

  // ---- Empty state ----
  if (visibleChannels.length === 0 && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {noChannels ? <Tv2 className="h-8 w-8" /> : <Calendar className="h-8 w-8" />}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">
            {noChannels ? "No playlist loaded" : "No EPG data yet"}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {noChannels
              ? "Add a playlist from the sidebar to populate the guide with channels."
              : "Import an XMLTV file to populate the guide with show times, descriptions, and progress bars."}
          </p>
        </div>
        {!noChannels && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="gap-2"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Import XMLTV File
            </Button>
            <Button
              variant="outline"
              onClick={() => setUrlDialogOpen(true)}
              className="gap-2"
            >
              <Globe className="h-4 w-4" />
              Fetch from URL
            </Button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.xmltv,application/xml,text/xml"
          className="hidden"
          onChange={handleXmltvImport}
        />
      </div>
    );
  }

  const totalRowsHeight = visibleChannels.length * ROW_HEIGHT;

  return (
    <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
      {/* ---- Toolbar ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1 backdrop-blur">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => shift(-6)}
            aria-label="Previous 6 hours"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">−6h</span>
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={goToNow}>
            <Crosshair className="h-4 w-4" />
            Now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => shift(6)}
            aria-label="Next 6 hours"
          >
            <span className="hidden sm:inline">+6h</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div
          className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/60 p-1 backdrop-blur"
          role="group"
          aria-label="Zoom level"
        >
          {(Object.keys(ZOOM_CONFIG) as ZoomKey[]).map((z) => (
            <Button
              key={z}
              size="sm"
              variant={zoom === z ? "default" : "ghost"}
              className="px-3"
              onClick={() => onZoomChange(z)}
              aria-pressed={zoom === z}
            >
              {ZOOM_CONFIG[z].label}
            </Button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          aria-label="Import XMLTV file"
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Import File</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setUrlDialogOpen(true)}
          aria-label="Fetch EPG from URL"
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">From URL</span>
        </Button>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span className="font-mono">
            {formatRange(windowStart)}
            {" → "}
            {formatRange(windowEnd)}
          </span>
        </div>
      </div>

      {/* ---- Grid scroll container ---- */}
      <div
        ref={scrollRef}
        aria-label="Electronic program guide"
        className="relative flex-1 overflow-auto rounded-2xl border border-border/60 bg-card/40 backdrop-blur scrollbar-none [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <div className="relative min-w-max" style={{ width: LEFT_COL_WIDTH + gridWidth }}>
          {/* ---- Ruler row (sticky top) ---- */}
          <div className="sticky top-0 z-30 flex" style={{ height: RULER_HEIGHT }}>
            <div
              className="sticky left-0 z-40 flex items-center gap-2 border-b border-r border-border/60 bg-card/95 px-3 text-sm font-semibold text-muted-foreground backdrop-blur-xl"
              style={{ width: LEFT_COL_WIDTH }}
            >
              <Tv2 className="h-4 w-4 text-primary" />
              <span className="truncate">Channels</span>
            </div>
            <div
              className="relative border-b border-border/60 bg-card/95 backdrop-blur-xl"
              style={{ width: gridWidth, height: RULER_HEIGHT }}
            >
              {hourTicks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-full flex-col justify-center border-l border-border/40 pl-2"
                  style={{ left: tick.x }}
                >
                  <span className="text-xs font-semibold text-foreground">{tick.label}</span>
                  {tick.sub && (
                    <span className="text-[10px] text-muted-foreground">{tick.sub}</span>
                  )}
                </div>
              ))}
              {nowVisible && (
                <div
                  className="pointer-events-none absolute top-1 z-10"
                  style={{ left: nowX }}
                >
                  <span className="-translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">
                    Now
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ---- Body ---- */}
          {loading ? (
            <SkeletonRows pxPerMin={pxPerMin} />
          ) : (
            visibleChannels.map((ch, i) => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                programmes={rowsData[i]}
                windowStart={windowStart}
                pxPerMin={pxPerMin}
                now={now}
              />
            ))
          )}

          {/* ---- Vertical NOW line spanning the body ---- */}
          {nowVisible && !loading && (
            <div
              className="pointer-events-none absolute z-20"
              style={{
                left: LEFT_COL_WIDTH + nowX,
                top: RULER_HEIGHT,
                width: 2,
                height: totalRowsHeight,
              }}
              aria-hidden
            >
              <div className="h-full w-full bg-primary shadow-[0_0_8px_0_var(--primary)]" />
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,.xmltv,application/xml,text/xml"
        className="hidden"
        onChange={handleXmltvImport}
      />

      {/* ---- EPG URL Dialog ---- */}
      <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fetch EPG from URL</DialogTitle>
            <DialogDescription>
              Enter a public XMLTV URL. Cross-origin requests will be proxied automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="epg-url-input">XMLTV / EPG URL</Label>
              <Input
                id="epg-url-input"
                placeholder="https://example.com/epg.xml"
                value={epgUrlInput}
                onChange={(e) => setEpgUrlInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUrlDialogOpen(false)} disabled={importingUrl}>
              Cancel
            </Button>
            <Button onClick={handleUrlImport} disabled={importingUrl || !epgUrlInput.trim()}>
              {importingUrl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
              Fetch & Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Skeleton rows while loading ----------
function SkeletonRows({ pxPerMin }: { pxPerMin: number }) {
  const gridWidth = WINDOW_HOURS * 60 * pxPerMin;
  return (
    <div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex border-b border-border/40" style={{ height: ROW_HEIGHT }}>
          <div
            className="sticky left-0 z-10 flex items-center gap-2 border-r border-border/60 bg-card/95 px-2 backdrop-blur-xl"
            style={{ width: LEFT_COL_WIDTH }}
          >
            <div className="h-8 w-8 rounded-lg bg-muted/60 shimmer" />
            <div className="h-3 w-24 rounded bg-muted/60 shimmer" />
          </div>
          <div className="relative" style={{ width: gridWidth, height: ROW_HEIGHT }}>
            {Array.from({ length: 3 }).map((_, j) => (
              <div
                key={j}
                className="absolute top-2 bottom-2 rounded-lg bg-muted/40 shimmer"
                style={{
                  left: j * 220 + 6,
                  width: 160 + ((i * 37 + j * 23) % 80),
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Single channel row ----------
interface ChannelRowProps {
  channel: Channel;
  programmes: EpgProgramme[];
  windowStart: number;
  pxPerMin: number;
  now: number;
}

function ChannelRow({ channel, programmes, windowStart, pxPerMin, now }: ChannelRowProps) {
  return (
    <div
      className="flex border-b border-border/40 transition-colors hover:bg-muted/10"
      style={{ height: ROW_HEIGHT }}
    >
      <div
        className="sticky left-0 z-10 flex items-center gap-2 border-r border-border/60 bg-card/95 px-2 backdrop-blur-xl"
        style={{ width: LEFT_COL_WIDTH }}
      >
        <ChannelLogo name={channel.name} src={channel.logo} size={32} />
        <span className="truncate text-sm font-medium" title={channel.name}>
          {channel.name}
        </span>
      </div>
      <div
        className="relative"
        style={{ width: WINDOW_HOURS * 60 * pxPerMin, height: ROW_HEIGHT }}
      >
        {programmes.map((p) => (
          <ProgrammeCell
            key={p.id}
            programme={p}
            channel={channel}
            windowStart={windowStart}
            pxPerMin={pxPerMin}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Programme cell + popover ----------
interface ProgrammeCellProps {
  programme: EpgProgramme;
  channel: Channel;
  windowStart: number;
  pxPerMin: number;
  now: number;
}

function ProgrammeCell({
  programme,
  channel,
  windowStart,
  pxPerMin,
  now,
}: ProgrammeCellProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const start = programme.start;
  const stop = programme.stop;
  const left = Math.max(0, ((start - windowStart) / 60_000) * pxPerMin);
  const width = Math.max(48, ((stop - start) / 60_000) * pxPerMin - 4);
  const airing = now >= start && now < stop;
  const elapsed = airing
    ? Math.min(1, Math.max(0, (now - start) / (stop - start)))
    : stop <= now
      ? 1
      : 0;
  const upcoming = now < start;

  const ariaLabel = `${channel.name} — ${programme.title} — ${formatTimeRange(start, stop)}`;

  const onRemind = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast({
        title: "Notifications not supported",
        description: "Your browser doesn't support web notifications.",
        variant: "destructive",
      });
      return;
    }
    let perm = Notification.permission;
    if (perm !== "granted") {
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = "denied";
      }
    }
    if (perm !== "granted") {
      toast({
        title: "Notifications blocked",
        description: "Enable notifications in your browser settings to set reminders.",
        variant: "destructive",
      });
      return;
    }
    const msUntilStart = start - Date.now();
    if (msUntilStart <= 0) {
      toast({
        title: "Already airing or past",
        description: "This programme has already started.",
      });
      return;
    }
    if (msUntilStart > 24 * 60 * 60 * 1000) {
      toast({
        title: "Too far in the future",
        description: "Reminders can only be set for programmes within 24 hours.",
        variant: "destructive",
      });
      return;
    }
    setTimeout(() => {
      try {
        new Notification(programme.title, {
          body: `Starting now on ${channel.name}${programme.subtitle ? ` — ${programme.subtitle}` : ""}`,
          tag: programme.id,
        });
      } catch (err) {
        console.error("Notification error", err);
      }
    }, msUntilStart);
    toast({
      title: "Reminder set",
      description: `You'll be notified when "${programme.title}" starts on ${channel.name}.`,
    });
  };

  const onWatch = (e: React.MouseEvent) => {
    e.stopPropagation();
    useIptv.getState().openPlayer(channel);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          aria-label={ariaLabel}
          className={cn(
            "absolute top-1.5 bottom-1.5 overflow-hidden rounded-lg border px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            airing
              ? "border-primary/60 bg-primary/15 hover:bg-primary/20"
              : upcoming
                ? "border-border/60 bg-muted/50 hover:bg-muted/80"
                : "border-border/40 bg-card/60 hover:bg-card",
          )}
          style={{ left: left + 2, width }}
        >
          <div className="flex h-full flex-col">
            <span className="line-clamp-1 text-xs font-medium leading-tight text-foreground">
              {programme.title}
            </span>
            {width > 100 && programme.subtitle && (
              <span className="line-clamp-1 text-[10px] text-muted-foreground">
                {programme.subtitle}
              </span>
            )}
            {airing && (
              <div className="mt-auto h-0.5 w-full overflow-hidden rounded-full bg-primary/30">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${elapsed * 100}%` }}
                />
              </div>
            )}
            {airing && (
              <span className="absolute right-1 top-1 rounded bg-primary px-1 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">
                Live
              </span>
            )}
          </div>
        </motion.button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="w-80 rounded-xl border-border/60 bg-popover/95 p-0 backdrop-blur-xl"
      >
        <div className="space-y-3 p-4">
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold leading-tight">{programme.title}</h3>
              {airing && (
                <span className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                  Live
                </span>
              )}
            </div>
            {programme.subtitle && (
              <p className="text-xs font-medium text-muted-foreground">
                {programme.subtitle}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono">{formatTimeRange(start, stop)}</span>
            <span aria-hidden>·</span>
            <span>{Math.round((stop - start) / 60_000)} min</span>
            {programme.category && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{programme.category}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <ChannelLogo
              name={channel.name}
              src={channel.logo}
              size={20}
              rounded="full"
            />
            <span className="font-medium">{channel.name}</span>
          </div>

          {airing && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Airing now</span>
                <span>{Math.round(elapsed * 100)}%</span>
              </div>
              <Progress value={elapsed * 100} className="h-1.5" />
            </div>
          )}

          {programme.desc && (
            <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
              {programme.desc}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              size="sm"
              className="col-span-2 gap-1.5"
              onClick={onWatch}
            >
              <Play className="h-3.5 w-3.5" />
              Watch {channel.name}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={onRemind}
            >
              <Bell className="h-3.5 w-3.5" />
              Remind me
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled
              title="Recording coming soon"
            >
              <Video className="h-3.5 w-3.5" />
              Record
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
