/// <reference lib="webworker" />
// Web Worker that fetches an M3U URL (or accepts pasted text) and parses it
// off the main thread. Posts progress + result messages.

import { parseM3U } from "@/lib/iptv/m3u-parser";

export interface M3UWorkerRequest {
  playlistId: string;
  source: { kind: "url"; url: string } | { kind: "text"; text: string };
}

export interface M3UWorkerProgress {
  type: "progress";
  processed: number;
}

export interface M3UWorkerDone {
  type: "done";
  result: ReturnType<typeof parseM3U>;
}

export interface M3UWorkerError {
  type: "error";
  message: string;
}

self.onmessage = async (e: MessageEvent<M3UWorkerRequest>) => {
  const { playlistId, source } = e.data;
  try {
    let text: string;
    if (source.kind === "text") {
      text = source.text;
    } else {
      try {
        const res = await fetch(source.url, { mode: "cors" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        text = await res.text();
      } catch {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(source.url)}`;
        const proxyRes = await fetch(proxyUrl);
        if (!proxyRes.ok) {
          throw new Error(`HTTP ${proxyRes.status} ${proxyRes.statusText}`);
        }
        text = await proxyRes.text();
      }
    }
    const result = parseM3U(text, playlistId, (processed) => {
      const msg: M3UWorkerProgress = { type: "progress", processed };
      (self as unknown as Worker).postMessage(msg);
    });
    const msg: M3UWorkerDone = { type: "done", result };
    (self as unknown as Worker).postMessage(msg);
  } catch (err) {
    const msg: M3UWorkerError = {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(msg);
  }
};
