"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings2,
  X,
  ChevronUp,
  ChevronDown,
  Gauge,
  Subtitles,
  Languages,
  PictureInPicture2,
  Tv,
  Info,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import { useIptv } from "@/lib/iptv/store";
import { getDb, loadSettings } from "@/lib/iptv/db";
import { createEngine, resolveStreamUrl, type EngineHandle, type PlayerStats, type ManifestInfo } from "@/lib/iptv/player-engine";
import type { Channel } from "@/lib/iptv/types";
import { ChannelLogo } from "./channel-logo";
import { formatTime, gradientFromString } from "@/lib/iptv/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AUTO_HIDE_MS = 3000;

export function Player() {
  const {
    playerOpen,
    playerChannel,
    playerQueue,
    playerIndex,
    closePlayer,
    zap,
    settings,
    setSettings,
    setHistory,
    infoOverlayVisible,
    setInfoOverlay,
    recent,
    setRecent,
    favorites,
  } = useIptv();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeEngineRef = useRef<EngineHandle | null>(null);
  const [engineHandle, setEngineHandle] = useState<EngineHandle | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const loadIdRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [manifest, setManifest] = useState<ManifestInfo | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState<{ message: string; retry?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [accentGrad, setAccentGrad] = useState<[string, string]>(["oklch(0.65 0.24 18)", "oklch(0.55 0.2 25)"]);

  // Safe play helper to prevent unhandled AbortError and NotAllowedError exceptions
  const safePlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const p = v.play();
      if (p !== undefined) {
        await p;
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" ||
          err.name === "NotAllowedError" ||
          err.message.includes("interrupted"))
      ) {
        // Normal browser interruption when stream reloads or browser autoplay policy applies
        return;
      }
      console.warn("Video playback play error:", err);
    }
  }, []);

  // Suppress browser media AbortErrors / autoplay restrictions from triggering Next.js dev overlay
  useEffect(() => {
    const handleRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      if (
        reason &&
        (reason.name === "AbortError" ||
          reason.name === "NotAllowedError" ||
          (typeof reason.message === "string" &&
            (reason.message.includes("interrupted by a new load request") ||
              reason.message.includes("interrupted by a call to pause()"))))
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  // Clean up engine completely when player unmounts
  useEffect(() => {
    return () => {
      loadIdRef.current += 1;
      if (activeEngineRef.current) {
        try {
          activeEngineRef.current.destroy();
        } catch {}
        activeEngineRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute("src");
          videoRef.current.load();
        } catch {}
      }
    };
  }, []);

  // Clean up engine completely when player closes
  useEffect(() => {
    if (!playerOpen) {
      loadIdRef.current += 1;
      if (activeEngineRef.current) {
        try {
          activeEngineRef.current.destroy();
        } catch {}
        activeEngineRef.current = null;
      }
      setEngineHandle(null);
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute("src");
          videoRef.current.load();
        } catch {}
      }
      setPlaying(false);
      setLoading(false);
      setError(null);
    }
  }, [playerOpen]);

  // Load settings once
  useEffect(() => {
    if (typeof window === "undefined") return;
    loadSettings().then((s) => setSettings(s));
  }, [setSettings]);

  // (Re)load stream when channel changes. Uses a ref so the retry callback can
  // re-invoke the latest version without a TDZ self-reference.
  const loadStreamRef = useRef<(channel: Channel) => void | Promise<void>>(() => {});

  const loadStream = useCallback(
    async (channel: Channel) => {
      if (!videoRef.current) return;
      const v = videoRef.current;
      const thisLoadId = ++loadIdRef.current;

      setError(null);
      setLoading(true);
      setManifest(null);
      setStats(null);
      setAccentGrad(gradientFromString(channel.name));

      // 1. Tear down old engine cleanly using ref
      if (activeEngineRef.current) {
        try {
          activeEngineRef.current.destroy();
        } catch (e) {
          console.warn("Failed to destroy previous engine:", e);
        }
        activeEngineRef.current = null;
      }
      setEngineHandle(null);

      // 2. Fully reset video element and MediaSource
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {}

      const s = settings;
      const url = resolveStreamUrl(channel.url, s);

      try {
        const h = await createEngine({
          video: v,
          url,
          settings: s,
          onError: (e) => {
            if (thisLoadId !== loadIdRef.current) return;
            // exponential backoff retry (max 3)
            const attempt = retryCount.current;
            if (attempt < 3) {
              retryCount.current += 1;
              const delay = Math.pow(2, attempt) * 1000;
              setTimeout(() => {
                if (useIptv.getState().playerOpen && thisLoadId === loadIdRef.current) {
                  loadStreamRef.current(channel);
                }
              }, delay);
              setError({ message: `Retrying (${attempt + 1}/3)… ${e.message}` });
            } else {
              setError({
                message:
                  "Couldn't play this stream. It may be blocked by CORS, offline, or in an unsupported format. Try enabling the proxy in Settings.",
                retry: true,
              });
            }
          },
          onManifestParsed: (info) => {
            if (thisLoadId !== loadIdRef.current) return;
            setManifest(info);
            retryCount.current = 0;
            void safePlay();
          },
        });

        // Guard against race condition: if another stream started loading while awaiting createEngine, discard this engine immediately
        if (thisLoadId !== loadIdRef.current) {
          try {
            h.destroy();
          } catch {}
          return;
        }

        activeEngineRef.current = h;
        setEngineHandle(h);

        // Native <video> fallback may not fire manifest; ensure loading clears & starts play
        const onCanPlay = () => {
          if (thisLoadId !== loadIdRef.current) return;
          setLoading(false);
          if (v.paused) {
            void safePlay();
          }
        };
        v.addEventListener("canplay", onCanPlay, { once: true });
      } catch (e) {
        if (thisLoadId !== loadIdRef.current) return;
        setError({
          message:
            e instanceof Error
              ? `${e.message}. If this is an HLS stream in Safari it should still work natively.`
              : String(e),
          retry: true,
        });
        setLoading(false);
      }
    },
    [settings, safePlay],
  );

  // Keep the ref in sync so the retry callback always calls the latest loadStream.
  useEffect(() => {
    loadStreamRef.current = loadStream;
  }, [loadStream]);

  useEffect(() => {
    if (playerOpen && playerChannel) {
      loadStream(playerChannel);
      // record history
      (async () => {
        try {
          const db = getDb();
          const entry = {
            id: playerChannel.id,
            playlistId: playerChannel.playlistId,
            channelName: playerChannel.name,
            channelLogo: playerChannel.logo,
            watchedAt: Date.now(),
          };
          await db.history.put(entry);
          try {
            await fetch("/api/history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(entry),
            });
          } catch {}
          // update recent list (dedupe, newest first)
          const next = [playerChannel, ...recent.filter((c) => c.id !== playerChannel.id)].slice(0, 24);
          setRecent(next);
          // fetch latest from db too for full history view
          const all = await db.history.orderBy("watchedAt").reverse().limit(50).toArray();
          const channels = await db.channels.bulkGet(all.map((h) => h.id));
          const merged = all
            .map((h, i) => channels[i])
            .filter((c): c is Channel => Boolean(c));
          setHistory(merged);
        } catch {}
      })();
    }
  }, [playerOpen, playerChannel?.id]);

  // Reset retry counter on new channel
  useEffect(() => {
    retryCount.current = 0;
  }, [playerChannel?.id]);

  // Video event listeners
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVol = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };
    const onTime = () => {
      setPosition(v.currentTime);
      setDuration(v.duration || 0);
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onTime);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onTime);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
    };
  }, [playerOpen]);

  // Fullscreen tracking
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Auto-hide controls
  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (settings.autoHideControls === false) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
      setStatsOpen(false);
    }, AUTO_HIDE_MS);
  }, [settings.autoHideControls]);

  useEffect(() => {
    if (playerOpen) bumpControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [playerOpen, bumpControls]);

  // Stats polling
  useEffect(() => {
    if (!statsOpen) return;
    const id = setInterval(() => {
      if (engineHandle) setStats(engineHandle.getStats());
    }, 1000);
    return () => clearInterval(id);
  }, [statsOpen, engineHandle]);

  // Keyboard
  useEffect(() => {
    if (!playerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          if (v.paused) void safePlay(); else v.pause();
          break;
        case "arrowright":
          v.currentTime += 10;
          break;
        case "arrowleft":
          v.currentTime -= 10;
          break;
        case "arrowup":
          zap(1);
          break;
        case "arrowdown":
          zap(-1);
          break;
        case "f":
          if (document.fullscreenElement) document.exitFullscreen();
          else containerRef.current?.requestFullscreen();
          break;
        case "m":
          v.muted = !v.muted;
          break;
        case "i":
          setShowInfo((s) => !s);
          break;
        case "escape":
          if (document.fullscreenElement) document.exitFullscreen();
          else closePlayer();
          break;
        case "n":
          zap(1);
          break;
        case "p":
          zap(-1);
          break;
      }
      bumpControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playerOpen, zap, closePlayer, bumpControls, safePlay]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await containerRef.current?.requestFullscreen();
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void safePlay(); else v.pause();
  }, [safePlay]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, []);

  const onVolumeInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = Number(e.target.value) / 100;
    v.volume = val;
    v.muted = val === 0;
  }, []);

  const onSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = (Number(e.target.value) / 1000) * (v.duration || 0);
  }, []);

  const togglePiP = useCallback(async () => {
    const v = videoRef.current as HTMLVideoElement & { requestPictureInPicture?: () => Promise<void> };
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
    } catch {}
  }, []);

  if (!playerOpen) return null;

  const isLive = manifest?.isLive || (playerChannel?.group?.toLowerCase().includes("live"));
  const isFav = playerChannel ? favorites.has(playerChannel.id) : false;

  return (
    <AnimatePresence>
      {playerOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black"
          ref={containerRef}
          onMouseMove={bumpControls}
          onClick={(e) => {
            // click on backdrop (not controls) toggles play
            if (e.target === e.currentTarget || e.target === videoRef.current) togglePlay();
          }}
        >
          {/* Background gradient ambient glow from channel */}
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background: `radial-gradient(80% 60% at 50% 0%, ${accentGrad[0]}, transparent 70%)`,
            }}
          />

          <video
            ref={videoRef}
            className="relative h-full w-full bg-black object-contain"
            playsInline
            controls={false}
          />

          {loading && !error && (
            <div
              role="progressbar"
              aria-label="Loading stream"
              className="absolute inset-x-0 top-0 z-30 h-1 overflow-hidden bg-white/15"
            >
              <motion.div
                className="h-full w-1/3 bg-primary"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
              />
            </div>
          )}

          {/* Top bar */}
          <AnimatePresence>
            {controlsVisible && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 p-4 bg-gradient-to-b from-black/70 to-transparent"
              >
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={closePlayer}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-3 min-w-0">
                  {playerChannel && (
                    <ChannelLogo name={playerChannel.name} src={playerChannel.logo} size={40} />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-white text-lg">
                        {playerChannel?.name}
                      </span>
                      {playerChannel?.group && (
                        <span className="hidden sm:inline-block rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
                          {playerChannel.group}
                        </span>
                      )}
                    </div>
                    {playerChannel?.number && (
                      <span className="text-xs text-white/60">CH {playerChannel.number}</span>
                    )}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/10"
                    onClick={() => setStatsOpen((s) => !s)}
                    title="Stats for nerds (I)"
                  >
                    <Gauge className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/10"
                    onClick={() => setShowInfo((s) => !s)}
                    title="Info overlay"
                  >
                    <Info className="h-5 w-5" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Center loading spinner */}
          {loading && !error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span className="text-sm text-white/75" role="status">
                  Loading {playerChannel?.name ?? "stream"}...
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
              <div className="glass-strong rounded-2xl p-6 max-w-md text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                  <X className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-semibold text-white">Playback error</h3>
                <p className="mt-2 text-sm text-white/70">{error.message}</p>
                <div className="mt-5 flex justify-center gap-2">
                  {error.retry && (
                    <Button
                      variant="default"
                      onClick={() => playerChannel && loadStream(playerChannel)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  )}
                  <Button variant="outline" onClick={closePlayer}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Stats for nerds */}
          <AnimatePresence>
            {statsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-20 right-4 z-30 w-64 glass-strong rounded-2xl p-4 text-xs text-white"
              >
                <div className="mb-2 font-semibold flex items-center gap-2">
                  <Gauge className="h-4 w-4" /> Stats for nerds
                </div>
                <dl className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                  <Stat label="Engine" value={engineHandle?.engine ?? "—"} />
                  <Stat label="Bitrate" value={stats ? `${stats.bitrate} kbps` : "—"} />
                  <Stat label="Resolution" value={stats?.resolution ?? "—"} />
                  <Stat label="Buffered" value={stats ? `${stats.bufferedSeconds.toFixed(1)}s` : "—"} />
                  <Stat label="Dropped" value={stats ? String(stats.droppedFrames) : "—"} />
                  <Stat label="FPS" value={stats ? String(stats.fps) : "—"} />
                  <Stat label="Latency" value={stats ? `${stats.latencyMs}ms` : "—"} />
                  <Stat label="Levels" value={manifest ? String(manifest.levels.length) : "—"} />
                </dl>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Info overlay (the TV-style channel-change card) */}
          <ChannelInfoOverlay visible={showInfo || infoOverlayVisible} channel={playerChannel} accentGrad={accentGrad} />

          {/* Bottom controls */}
          <AnimatePresence>
            {controlsVisible && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-0 inset-x-0 z-20 p-4 bg-gradient-to-t from-black/80 to-transparent"
              >
                {/* Seek bar (only for VOD) */}
                {!isLive && duration > 0 && (
                  <div className="mb-3 flex items-center gap-3 text-white text-sm">
                    <span className="tabular-nums w-12">{formatTime(position)}</span>
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      value={duration ? (position / duration) * 1000 : 0}
                      onChange={onSeek}
                      className="flex-1 h-1.5 accent-primary rounded-full cursor-pointer"
                      aria-label="Seek"
                    />
                    <span className="tabular-nums w-12 text-right">{formatTime(duration)}</span>
                  </div>
                )}
                {isLive && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded bg-destructive px-2 py-0.5 text-xs font-bold text-white">LIVE</span>
                    <button
                      onClick={() => {
                        const v = videoRef.current;
                        if (v) v.currentTime = v.duration || (v.seekable.end(v.seekable.length - 1));
                      }}
                      className="ml-auto rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
                    >
                      Jump to live
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => zap(-1)}>
                    <ChevronDown className="h-5 w-5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={togglePlay}>
                    {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => zap(1)}>
                    <ChevronUp className="h-5 w-5" />
                  </Button>

                  <div className="group flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={toggleMute}>
                      {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </Button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={muted ? 0 : volume * 100}
                      onChange={onVolumeInput}
                      className="h-1 w-0 group-hover:w-20 transition-all accent-primary cursor-pointer"
                      aria-label="Volume"
                    />
                  </div>

                  <div className="ml-auto flex items-center gap-1">
                    {/* Quality / audio / subtitle selector */}
                    <PlayerSettingsMenu
                      manifest={manifest}
                      handle={engineHandle}
                    />
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={togglePiP} title="Picture in Picture">
                      <PictureInPicture2 className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={toggleFullscreen} title="Fullscreen (F)">
                      {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                    </Button>
                  </div>
                </div>
                {playerQueue.length > 1 && (
                  <p className="mt-1 text-xs text-white/50">
                    {playerIndex + 1} / {playerQueue.length} in queue — use ↑/↓ to zap
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-white/50">{label}</dt>
      <dd className="text-right font-mono">{value}</dd>
    </>
  );
}

function PlayerSettingsMenu({
  manifest,
  handle,
}: {
  manifest: ManifestInfo | null;
  handle: EngineHandle | null;
}) {
  const levels = handle?.levels() ?? manifest?.levels ?? [];
  const audioTracks = handle?.audioTracks() ?? manifest?.audioTracks ?? [];
  const subtitleTracks = handle?.subtitleTracks() ?? manifest?.subtitleTracks ?? [];
  const hasContent = levels.length + audioTracks.length + subtitleTracks.length > 0;
  if (!hasContent) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" title="Quality & tracks">
          <Settings2 className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {levels.length > 0 && (
          <>
            <DropdownMenuLabel>
              <Gauge className="inline mr-1 h-4 w-4" /> Quality
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handle?.setLevel(-1)}>Auto</DropdownMenuItem>
            <DropdownMenuSeparator />
            {levels.map((l, i) => (
              <DropdownMenuItem key={i} onClick={() => handle?.setLevel(i)}>
                {l.height ? `${l.height}p` : l.label || `Level ${i + 1}`}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {audioTracks.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              <Languages className="inline mr-1 h-4 w-4" /> Audio
            </DropdownMenuLabel>
            {audioTracks.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => handle?.setAudioTrack(t.id)}>
                {t.name} {t.lang && `(${t.lang})`}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {subtitleTracks.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              <Subtitles className="inline mr-1 h-4 w-4" /> Subtitles
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handle?.setSubtitleTrack(-1)}>Off</DropdownMenuItem>
            {subtitleTracks.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => handle?.setSubtitleTrack(t.id)}>
                {t.name} {t.lang && `(${t.lang})`}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChannelInfoOverlay({
  visible,
  channel,
  accentGrad,
}: {
  visible: boolean;
  channel: Channel | null;
  accentGrad: [string, string];
}) {
  // auto-hide after 4s — all setState calls happen inside setTimeout callbacks
  // to avoid synchronous setState-in-effect cascades.
  const [internalVisible, setInternalVisible] = useState(false);
  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => setInternalVisible(false), 0);
      return () => clearTimeout(t);
    }
    const show = setTimeout(() => setInternalVisible(true), 0);
    const hide = setTimeout(() => setInternalVisible(false), 4000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [visible, channel?.id]);
  return (
    <AnimatePresence>
      {internalVisible && channel && (
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="absolute left-4 top-20 z-30 max-w-sm"
        >
          <div
            className="glass-strong rounded-2xl p-4 flex gap-3 items-center"
            style={{ boxShadow: `0 8px 32px -8px ${accentGrad[0]}` }}
          >
            <ChannelLogo name={channel.name} src={channel.logo} size={56} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {channel.number && (
                  <span className="text-xs font-mono text-white/60">CH {channel.number}</span>
                )}
                <span className="font-semibold text-white truncate">{channel.name}</span>
              </div>
              {channel.group && (
                <p className="text-xs text-white/60 truncate">{channel.group}</p>
              )}
              {channel.quality && (
                <span className="mt-1 inline-block rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {channel.quality}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
