"use client";

import { useEffect } from "react";

/**
 * Registers the Streamline service worker (`/sw.js`) on mount.
 *
 * - Only runs in production to avoid caching dev assets and HMR churn.
 * - Silently no-ops if `serviceWorker` is unavailable (SSR, iOS in-app
 *   browsers, etc.) so the rest of the app is unaffected.
 * - Renders `null` — this is a side-effect only component.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Skip in development to avoid caching hot-reloaded assets.
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch {
        // Service worker registration failures are non-fatal — the app
        // still works, just without offline support / PWA installability.
      }
    };

    // Defer until first idle to keep startup snappy.
    if ("requestIdleCallback" in window) {
      const handle = (window as unknown as {
        requestIdleCallback: (cb: () => void) => number;
      }).requestIdleCallback(register);
      return () => {
        const w = window as unknown as {
          cancelIdleCallback?: (h: number) => void;
        };
        w.cancelIdleCallback?.(handle);
      };
    }
    register();
  }, []);

  return null;
}

export default RegisterSW;
