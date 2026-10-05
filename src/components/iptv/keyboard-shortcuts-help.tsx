"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X } from "lucide-react";
import { useIptv } from "@/lib/iptv/store";

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Space", action: "Play / Pause" },
  { keys: "F", action: "Toggle fullscreen" },
  { keys: "M", action: "Mute" },
  { keys: "↑ / ↓", action: "Next / previous channel" },
  { keys: "← / →", action: "Seek ±10s (VOD)" },
  { keys: "G", action: "Open Guide" },
  { keys: "/", action: "Focus search" },
  { keys: "0–9", action: "Type channel number to jump" },
  { keys: "N / P", action: "Next / previous channel" },
  { keys: "I", action: "Toggle info overlay" },
  { keys: "C", action: "Toggle captions" },
  { keys: "T", action: "Theater mode" },
  { keys: "?", action: "Show this cheatsheet" },
  { keys: "⌘ / Ctrl + K", action: "Open command palette" },
  { keys: "Esc", action: "Exit player / close dialog" },
];

export function KeyboardShortcutsHelp() {
  const { keyboardHelpOpen, setKeyboardHelpOpen } = useIptv();
  return (
    <AnimatePresence>
      {keyboardHelpOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setKeyboardHelpOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg glass-strong rounded-2xl border shadow-2xl"
          >
            <div className="flex items-center justify-between p-5 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-lg">Keyboard shortcuts</h2>
              </div>
              <button
                onClick={() => setKeyboardHelpOpen(false)}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3">
              <ul className="divide-y divide-border/40">
                {SHORTCUTS.map((s) => (
                  <li key={s.keys} className="flex items-center justify-between gap-4 px-2 py-2.5">
                    <span className="text-sm text-muted-foreground">{s.action}</span>
                    <kbd className="rounded-md border border-border/60 bg-muted px-2 py-1 text-xs font-mono">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
