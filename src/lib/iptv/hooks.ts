import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Returns true only after the component has hydrated on the client. SSR-safe. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Convenience: read a client-only value after hydration (returns fallback during SSR). */
export function useClientValue<T>(getter: () => T, fallback: T): T {
  const hydrated = useHydrated();
  return hydrated ? getter() : fallback;
}

/** Debounced value. */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Format seconds as h:mm:ss or m:ss. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** Format an epoch-ms time range for EPG display. */
export function formatTimeRange(start: number, stop: number): string {
  const fmt = (t: number) =>
    new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(stop)}`;
}

/** Generate a stable gradient pair from a string (for monogram fallbacks). */
export function gradientFromString(str: string): [string, string] {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 40) % 360;
  return [`oklch(0.6 0.18 ${hue1})`, `oklch(0.55 0.2 ${hue2})`];
}

/** Monogram (1-2 letters) from a channel name. */
export function monogram(name: string): string {
  const parts = name.replace(/[\[\(].*?[\]\)]/g, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Clamp a number. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
