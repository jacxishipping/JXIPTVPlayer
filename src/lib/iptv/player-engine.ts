// Player engine abstraction — auto-detects stream type from URL/extension and
// instantiates the appropriate player (hls.js, mpegts.js, or native <video>).

import type { Settings } from "./types";

export type Engine = "hls" | "mpegts" | "native" | "dash";

export interface EngineCreateOptions {
  video: HTMLVideoElement;
  url: string;
  settings: Settings;
  onError?: (e: Error) => void;
  onManifestParsed?: (data: ManifestInfo) => void;
}

export interface ManifestInfo {
  levels: Array<{ height: number; bitrate: number; label?: string }>;
  audioTracks: Array<{ id: number; name: string; lang?: string }>;
  subtitleTracks: Array<{ id: number; name: string; lang?: string }>;
  isLive: boolean;
  duration: number;
}

export interface EngineHandle {
  engine: Engine;
  destroy: () => void;
  getStats: () => PlayerStats;
  setLevel: (levelIndex: number) => void; // -1 = auto
  setAudioTrack: (id: number) => void;
  setSubtitleTrack: (id: number) => void;
  levels: () => Array<{ height: number; bitrate: number; label?: string }>;
  audioTracks: () => Array<{ id: number; name: string; lang?: string }>;
  subtitleTracks: () => Array<{ id: number; name: string; lang?: string }>;
}

export interface PlayerStats {
  bitrate: number; // kbps
  resolution: string;
  droppedFrames: number;
  bufferedSeconds: number;
  latencyMs: number;
  fps: number;
}

function detectEngine(url: string, settings: Settings): Engine {
  if (settings.defaultEngine !== "auto") return settings.defaultEngine;
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".mpd")) return "dash";
  if (u.endsWith(".flv") || u.includes(".flv?")) return "mpegts";
  if (u.endsWith(".ts") && !u.includes(".m3u8")) return "mpegts"; // raw mpegts
  if (u.endsWith(".m3u8") || u.includes(".m3u8?")) return "hls";
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".m4v") || u.endsWith(".mov")) return "native";
  // default to hls for unknown (covers most IPTV live)
  return "hls";
}

export async function createEngine(opts: EngineCreateOptions): Promise<EngineHandle> {
  const engine = detectEngine(opts.url, opts.settings);

  if (engine === "hls") {
    const Hls = (await import("hls.js")).default;
    if (Hls.isSupported()) {
      const bufferSec = Math.max(10, opts.settings.bufferSeconds || 15);
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: bufferSec,
        maxBufferLength: bufferSec,
        maxMaxBufferLength: bufferSec * 2,
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        maxFragLookUpTolerance: 0.25,
        liveSyncDurationCount: 3,
        autoStartLoad: true,
      });

      let recoveredMediaErrors = 0;
      let recoveredNetworkErrors = 0;

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) {
          console.warn("[HLS non-fatal error]", data.type, data.details);
          return;
        }

        switch (data.type) {
          case Hls.ErrorTypes.MEDIA_ERROR:
            recoveredMediaErrors++;
            console.warn(`[HLS] Fatal media error (${data.details}), recovery attempt ${recoveredMediaErrors}`);
            if (recoveredMediaErrors <= 2) {
              hls.recoverMediaError();
              return;
            }
            if (recoveredMediaErrors === 3) {
              console.warn(`[HLS] Swapping audio codec and recovering (${data.details})`);
              try {
                hls.swapAudioCodec();
              } catch {}
              hls.recoverMediaError();
              return;
            }
            opts.onError?.(new Error(`HLS media error: ${data.details}`));
            break;

          case Hls.ErrorTypes.NETWORK_ERROR:
            recoveredNetworkErrors++;
            console.warn(`[HLS] Fatal network error (${data.details}), recovery attempt ${recoveredNetworkErrors}`);
            if (recoveredNetworkErrors <= 3) {
              setTimeout(() => {
                hls.startLoad();
              }, 1000 * recoveredNetworkErrors);
              return;
            }
            opts.onError?.(new Error(`HLS network error: ${data.details}`));
            break;

          default:
            console.error(`[HLS] Unrecoverable fatal error: ${data.type} ${data.details}`);
            opts.onError?.(new Error(`HLS: ${data.type} ${data.details}`));
            break;
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        recoveredMediaErrors = 0;
        recoveredNetworkErrors = 0;
      });

      hls.loadSource(opts.url);
      hls.attachMedia(opts.video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        opts.onManifestParsed?.({
          levels: data.levels.map((l) => ({ height: l.height || 0, bitrate: l.bitrate, label: l.name })),
          audioTracks: hls.audioTracks.map((t, i) => ({ id: i, name: t.name, lang: t.lang })),
          subtitleTracks: hls.subtitleTracks.map((t, i) => ({ id: i, name: t.name, lang: t.lang })),
          isLive: data.levels[0]?.details?.live ?? hls.live,
          duration: opts.video.duration || 0,
        });
      });
      const getStats = (): PlayerStats => {
        const frag = hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : null;
        const v = opts.video;
        const buffered = v.buffered.length ? v.buffered.end(v.buffered.length - 1) - v.currentTime : 0;
        return {
          bitrate: frag ? Math.round(frag.bitrate / 1000) : 0,
          resolution: frag?.height ? `${frag.height}p` : v.videoWidth ? `${v.videoHeight}p` : "—",
          droppedFrames: 0,
          bufferedSeconds: Math.max(0, buffered),
          latencyMs: 0,
          fps: 0,
        };
      };
      return {
        engine,
        destroy: () => {
          try {
            hls.stopLoad();
            hls.detachMedia();
            hls.destroy();
          } catch {}
        },
        getStats,
        setLevel: (i) => (hls.currentLevel = i),
        setAudioTrack: (id) => (hls.audioTrack = id),
        setSubtitleTrack: (id) => (hls.subtitleTrack = id),
        levels: () => hls.levels.map((l) => ({ height: l.height || 0, bitrate: l.bitrate, label: l.name })),
        audioTracks: () => hls.audioTracks.map((t, i) => ({ id: i, name: t.name, lang: t.lang })),
        subtitleTracks: () => hls.subtitleTracks.map((t, i) => ({ id: i, name: t.name, lang: t.lang })),
      };
    } else if (opts.video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      opts.video.src = opts.url;
      const manifestInfo: ManifestInfo = {
        levels: [],
        audioTracks: [],
        subtitleTracks: [],
        isLive: false,
        duration: 0,
      };
      opts.video.addEventListener(
        "loadedmetadata",
        () => {
          manifestInfo.duration = opts.video.duration;
          opts.onManifestParsed?.(manifestInfo);
        },
        { once: true },
      );
      return nativeHandle(opts, "native");
    }
    throw new Error("HLS not supported in this browser.");
  }

  if (engine === "mpegts") {
    const mpegts = (await import("mpegts.js")).default;
    if (mpegts.isSupported()) {
      const player = mpegts.createPlayer({
        type: "mpegts",
        url: opts.url,
        isLive: true,
      });
      player.attachMediaElement(opts.video);
      player.load();
      const getStats = (): PlayerStats => {
        const v = opts.video;
        const buffered = v.buffered.length ? v.buffered.end(v.buffered.length - 1) - v.currentTime : 0;
        return {
          bitrate: 0,
          resolution: v.videoWidth ? `${v.videoHeight}p` : "—",
          droppedFrames: 0,
          bufferedSeconds: Math.max(0, buffered),
          latencyMs: 0,
          fps: 0,
        };
      };
      const manifestInfo: ManifestInfo = {
        levels: [],
        audioTracks: [],
        subtitleTracks: [],
        isLive: true,
        duration: 0,
      };
      player.on(mpegts.Events.MANIFEST_PARSED, () => opts.onManifestParsed?.(manifestInfo));
      player.on(mpegts.Events.ERROR, (type: string, detail: string) =>
        opts.onError?.(new Error(`mpegts: ${type} ${detail}`)),
      );
      return {
        engine: "mpegts",
        destroy: () => player.destroy(),
        getStats,
        setLevel: () => {},
        setAudioTrack: () => {},
        setSubtitleTrack: () => {},
        levels: () => [],
        audioTracks: () => [],
        subtitleTracks: () => [],
      };
    }
    throw new Error("MPEG-TS playback not supported.");
  }

  // native fallback
  opts.video.src = opts.url;
  return nativeHandle(opts, "native");
}

function nativeHandle(opts: EngineCreateOptions, engine: Engine): EngineHandle {
  const v = opts.video;
  v.addEventListener(
    "loadedmetadata",
    () => {
      opts.onManifestParsed?.({
        levels: [],
        audioTracks: [],
        subtitleTracks: [],
        isLive: !Number.isFinite(v.duration),
        duration: v.duration || 0,
      });
    },
    { once: true },
  );
  return {
    engine,
    destroy: () => {
      try {
        v.removeAttribute("src");
        v.load();
      } catch {}
    },
    getStats: () => {
      const buffered = v.buffered.length ? v.buffered.end(v.buffered.length - 1) - v.currentTime : 0;
      return {
        bitrate: 0,
        resolution: v.videoWidth ? `${v.videoHeight}p` : "—",
        droppedFrames: 0,
        bufferedSeconds: Math.max(0, buffered),
        latencyMs: 0,
        fps: 0,
      };
    },
    setLevel: () => {},
    setAudioTrack: () => {},
    setSubtitleTrack: () => {},
    levels: () => [],
    audioTracks: () => [],
    subtitleTracks: () => [],
  };
}

/** Build a stream URL, optionally routed through the proxy. */
export function resolveStreamUrl(url: string, settings: Settings): string {
  if (settings.proxyEnabled && settings.proxyUrl) {
    try {
      const proxy = new URL(settings.proxyUrl, window.location.origin);
      proxy.searchParams.set("url", url);
      return proxy.toString();
    } catch {
      return url;
    }
  }
  return url;
}
