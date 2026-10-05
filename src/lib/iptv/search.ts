import Fuse from "fuse.js";
import type { Channel } from "./types";

let fuse: Fuse<Channel> | null = null;
let lastIndex: Channel[] = [];

const options: Fuse.IFuseOptions<Channel> = {
  keys: [
    { name: "name", weight: 0.6 },
    { name: "group", weight: 0.2 },
    { name: "tvgName", weight: 0.15 },
    { name: "number", weight: 0.05 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeScore: true,
  minMatchCharLength: 1,
};

export function buildIndex(channels: Channel[]) {
  // Reuse the index if the channels reference is unchanged
  if (fuse && lastIndex === channels) return fuse;
  fuse = new Fuse(channels, options);
  lastIndex = channels;
  return fuse;
}

export function searchChannels(channels: Channel[], query: string): Channel[] {
  const q = query.trim();
  if (!q) return channels;
  const f = buildIndex(channels);
  return f.search(q).map((r) => r.item);
}
